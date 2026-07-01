import Redis from "ioredis";
import { PatientRecord } from "@nyaticare/core-architecture";

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const TTL_SECONDS = Number(process.env.REDIS_CACHE_TTL_SECONDS ?? 3600);

function cacheKey(nationalId: string): string {
  return `patient:${nationalId}`;
}

/**
 * Write-behind cache for patient records. Reads try Redis first
 * (sub-millisecond at the sub-county edge); on a cache miss the
 * caller is expected to fetch from the source-of-truth (Taifa Care
 * or a local HMIS mirror) and call `cachePatient` to populate it
 * for subsequent lookups.
 */
export async function getCachedPatient(nationalId: string): Promise<PatientRecord | null> {
  const raw = await redis.get(cacheKey(nationalId));
  return raw ? (JSON.parse(raw) as PatientRecord) : null;
}

export async function cachePatient(patient: PatientRecord): Promise<void> {
  await redis.set(cacheKey(patient.nationalId), JSON.stringify(patient), "EX", TTL_SECONDS);
}

export async function invalidatePatient(nationalId: string): Promise<void> {
  await redis.del(cacheKey(nationalId));
}

export { redis };
