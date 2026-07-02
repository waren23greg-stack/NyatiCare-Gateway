import "dotenv/config";
import express from "express";
import pino from "pino";
import { getSession, updateSession } from "./session/sessionStore";
import { handleUssdRequest } from "./handlers/menu";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });
const app = express();
const port = process.env.USSD_SERVICE_PORT ?? 4004;

// Africa's Talking POSTs USSD requests as application/x-www-form-urlencoded,
// not JSON — this is easy to miss and silently breaks every request if
// only express.json() is registered.
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get("/api/v1/health-check", (_req, res) => {
  res.status(200).json({ service: "ussd-gateway", status: "ok" });
});

/**
 * The actual callback URL to register with Africa's Talking. Must
 * respond with a plain-text body (not JSON) that starts with either
 * "CON " (continue) or "END " (close session), and must respond
 * within their ~10 second timeout.
 */
app.post("/api/v1/ussd/callback", async (req, res) => {
  const sessionId = req.body.sessionId as string;
  const phoneNumber = req.body.phoneNumber as string;
  const text = (req.body.text as string) ?? "";

  if (!sessionId || !phoneNumber) {
    logger.warn({ body: req.body }, "USSD callback missing required fields");
    res.set("Content-Type", "text/plain");
    return res.status(200).send("END Request could not be processed.");
  }

  const session = getSession(sessionId);

  try {
    const responseText = await handleUssdRequest({ sessionId, phoneNumber, text }, session);
    updateSession(sessionId, session);

    res.set("Content-Type", "text/plain");
    return res.status(200).send(responseText);
  } catch (error) {
    logger.error({ error: (error as Error).message, sessionId }, "USSD handler failed");
    res.set("Content-Type", "text/plain");
    return res.status(200).send("END A system error occurred. Please try again later.");
  }
});

app.listen(port, () => {
  logger.info(`ussd-gateway listening on port ${port}`);
});
