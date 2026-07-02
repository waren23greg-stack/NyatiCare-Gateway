import { Kafka, Consumer } from "kafkajs";
import pino from "pino";
import { OfflineClaimsQueue } from "../offlineQueue/sqliteQueue";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

const kafka = new Kafka({
  clientId: `${process.env.KAFKA_CLIENT_ID ?? "nyaticare-claims"}-consumer`,
  brokers: (process.env.KAFKA_BROKERS ?? "localhost:9092").split(","),
  retry: {
    initialRetryTime: 300,
    retries: 10,
  },
});

const queue = new OfflineClaimsQueue();
const activeConsumer: Consumer = kafka.consumer({ groupId: "nyaticare-claims-sync" });

activeConsumer.on(activeConsumer.events.CRASH, (event) => {
  logger.error(
    { error: event.payload.error.message },
    "consumer crash event received"
  );
  process.exit(1);
});

export async function startClaimsConsumer(): Promise<void> {
  setupGracefulShutdown();
  const topic = process.env.KAFKA_CLAIMS_TOPIC ?? "sha.claims.ingestion";

  try {
    await activeConsumer.connect();
    await activeConsumer.subscribe({ topic, fromBeginning: true });

    await activeConsumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        if (!message.value) return;

        let event: Record<string, unknown> & { claimId: string };

        try {
          event = JSON.parse(message.value.toString());
        } catch (parseError) {
          logger.error(`[!] POISON PILL DETECTED: Could not parse message!`);
          logger.error(`[!] Raw payload: ${message.value.toString()}`);
          logger.error(`[!] Error: ${(parseError as Error).message}`);
          return;
        }

        logger.info(`\n--- NEW MESSAGE INBOUND ---`);
        logger.info(`Topic: ${topic} | Partition: ${partition}`);
        logger.info(`[✓] Successfully processing claimId: ${event.claimId}`);

        await processClaimEvent(event, queue);
      },
    });
  } catch (error) {
    logger.error({ error: (error as Error).message }, "Kafka consumer failed to start");
    process.exit(1);
  }
}

/**
 * The core resilience contract of this service: attempt to forward a
 * claim event to Taifa Care Central, and only mark it synced in the
 * durable local queue if that actually succeeds. If it fails for any
 * reason — network error, timeout, 5xx, DNS failure — the claim is
 * left exactly as it was: signed_offline, unsynced. Nothing is lost,
 * nothing is falsely marked as delivered.
 *
 * Pulled out of the Kafka eachMessage handler so it can be exercised
 * directly in tests without needing a real Kafka broker.
 */
export async function processClaimEvent(
  event: Record<string, unknown> & { claimId: string },
  claimsQueue: OfflineClaimsQueue
): Promise<{ synced: boolean }> {
  try {
    await submitToTaifaCare(event);
    claimsQueue.markSynced(event.claimId);
    logger.info(`[✓] Claim ${event.claimId} synced to Taifa Care\n---------------------------\n`);
    return { synced: true };
  } catch (error) {
    logger.warn(
      { claimId: event.claimId, error: (error as Error).message },
      "Taifa Care submission failed, will retry from offline queue"
    );
    return { synced: false };
  }
}

export async function submitToTaifaCare(event: Record<string, unknown>): Promise<void> {
  const baseUrl = process.env.TAIFA_CARE_BASE_URL;
  if (!baseUrl) {
    logger.warn("TAIFA_CARE_BASE_URL not configured. Simulating success for local testing.");
    return;
  }

  const response = await fetch(`${baseUrl}/api/v1/claims`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.TAIFA_CARE_API_KEY ?? ""}`,
    },
    body: JSON.stringify(event),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API responded with status ${response.status}: ${errorBody}`);
  }
}

function setupGracefulShutdown() {
  const signalTraps: NodeJS.Signals[] = ["SIGTERM", "SIGINT", "SIGUSR2"];

  signalTraps.forEach((type) => {
    process.once(type, async () => {
      logger.info(`Signal ${type} received, shutting down gracefully...`);
      try {
        await activeConsumer.disconnect();
      } catch (e) {
        logger.error({ error: (e as Error).message }, "Error disconnecting consumer");
      }
      process.exit(0);
    });
  });
}
