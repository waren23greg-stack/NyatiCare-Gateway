import "dotenv/config";
import express from "express";
import pino from "pino";
import { v4 as uuidv4 } from "uuid";
import { hashClaimPayload, signClaimHash, Claim } from "@nyaticare/core-architecture";
import { OfflineClaimsQueue } from "./offlineQueue/sqliteQueue";
import { publishClaimEvent } from "./kafka/producer";
import { startClaimsConsumer } from "./kafka/consumer";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });
const app = express();
const port = process.env.CLAIMS_SERVICE_PORT ?? 4002;
const queue = new OfflineClaimsQueue();

app.use(express.json());

app.get("/api/v1/health-check", (_req, res) => {
  res.status(200).json({ service: "claims-ingestion", status: "ok" });
});

app.post("/api/v1/claims", async (req, res) => {
  const { facilityCode, facilitySecret, patientNationalId, amount } = req.body ?? {};

  if (!facilityCode || !facilitySecret || !patientNationalId || typeof amount !== "number") {
    return res.status(400).json({
      error: "facilityCode, facilitySecret, patientNationalId, and amount are required",
    });
  }

  const claimId = uuidv4();
  const createdAt = new Date().toISOString();
  const payload = { claimId, facilityCode, patientNationalId, amount, createdAt };
  const claimHash = hashClaimPayload(payload);
  const signatureHash = signClaimHash(claimHash, facilitySecret);

  const claim: Claim = {
    claimId,
    facilityCode,
    patientNationalId,
    amount,
    currency: "KES",
    status: "signed_offline",
    createdAt,
    signatureHash,
  };

  // Persist locally first (offline-first, works even if Kafka/Central are down).
  queue.enqueue(claim);

  try {
    await publishClaimEvent({
      claimId,
      facilityCode,
      patientNationalId,
      amount,
      signatureHash,
    });
    return res.status(202).json({ message: "Claim queued for sync", claimId });
  } catch (error) {
    logger.warn(
      { claimId, error: (error as Error).message },
      "Kafka publish failed, claim remains safely in local offline queue"
    );
    return res.status(202).json({
      message: "Claim stored locally; will sync once connectivity is restored",
      claimId,
    });
  }
});

app.listen(port, () => {
  logger.info(`claims-ingestion listening on port ${port}`);
});

startClaimsConsumer().catch((error) => {
  logger.error({ error: error.message }, "failed to start claims consumer");
});
