import crypto from "crypto";

/**
 * Produces a deterministic, tamper-evident hash for a claim payload so
 * it can be signed locally at the hospital edge before Taifa Care
 * connectivity is available, then verified once it syncs centrally.
 */
export function hashClaimPayload(payload: Record<string, unknown>): string {
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

/**
 * HMAC-signs a claim hash using a facility-specific secret. Each
 * accredited facility should be issued its own signing key during
 * onboarding to the DHA sync program.
 */
export function signClaimHash(claimHash: string, facilitySecret: string): string {
  return crypto.createHmac("sha256", facilitySecret).update(claimHash).digest("hex");
}

export function verifyClaimSignature(
  claimHash: string,
  signature: string,
  facilitySecret: string
): boolean {
  const expected = signClaimHash(claimHash, facilitySecret);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
