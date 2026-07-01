import { Kafka, Producer } from "kafkajs";

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID ?? "nyaticare-claims",
  brokers: (process.env.KAFKA_BROKERS ?? "localhost:9092").split(","),
});

let producer: Producer | null = null;

async function getProducer(): Promise<Producer> {
  if (!producer) {
    producer = kafka.producer();
    await producer.connect();
  }
  return producer;
}

export interface ClaimEvent {
  claimId: string;
  facilityCode: string;
  patientNationalId: string;
  amount: number;
  signatureHash: string;
}

/**
 * Publishes a signed claim onto the async ingestion topic. Downstream
 * consumers (fraud checks, Taifa Care sync workers, audit logging)
 * subscribe independently, decoupling claim intake from claim processing
 * so a slow or unavailable central endpoint never blocks hospital intake.
 */
export async function publishClaimEvent(event: ClaimEvent): Promise<void> {
  const topic = process.env.KAFKA_CLAIMS_TOPIC ?? "sha.claims.ingestion";
  const p = await getProducer();

  await p.send({
    topic,
    messages: [
      {
        key: event.claimId,
        value: JSON.stringify(event),
      },
    ],
  });
}

export async function disconnectProducer(): Promise<void> {
  if (producer) {
    await producer.disconnect();
    producer = null;
  }
}
