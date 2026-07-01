import { Kafka } from "kafkajs";
import pino from "pino";
import { OfflineClaimsQueue } from "../offlineQueue/sqliteQueue";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

const kafka = new Kafka({
  clientId: `${process.env.KAFKA_CLIENT_ID ?? "nyaticare-claims"}-consumer`,
  brokers: (process.env.KAFKA_BROKERS ?? "localhost:9092").split(","),
});

const queue = new OfflineClaimsQueue();

/**
 * Consumes claim events and attempts to forward them to Taifa Care
 * Central. On success, marks the local offline-queue record as synced.
 * On failure (central down / degraded), the event is simply not acked
 * as synced and will be retried — the offline queue is the source of
 * truth, Kafka is the delivery mechanism.
 */
export async function startClaimsConsumer(): Promise<void> {
  const consumer = kafka.consumer({ groupId: "nyaticare-claims-sync" });
  const topic = process.env.KAFKA_CLAIMS_TOPIC ?? "sha.claims.ingestion";

  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;

      const event = JSON.parse(message.value.toString());
      logger.info({ claimId: event.claimId }, "processing claim event");

      try {
        // NOTE: Replace with the real Taifa Care Central HMIS submission call.
        await submitToTaifaCare(event);
        queue.markSynced(event.claimId);
        logger.info({ claimId: event.claimId }, "claim synced to Taifa Care");
      } catch (error) {
        logger.warn(
          { claimId: event.claimId, error: (error as Error).message },
          "Taifa Care submission failed, will retry from offline queue"
        );
      }
    },
  });
}

async function submitToTaifaCare(event: Record<string, unknown>): Promise<void> {
  const baseUrl = process.env.TAIFA_CARE_BASE_URL;
  if (!baseUrl) {
    throw new Error("TAIFA_CARE_BASE_URL not configured");
  }
  // Placeholder for the real HTTP call to the central HMIS.
  // await axios.post(`${baseUrl}/v1/claims`, event, { timeout: 5000 });
}
