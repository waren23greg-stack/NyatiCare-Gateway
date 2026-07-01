import crypto from "crypto";
import { OtpFallbackEngine, FallbackResult } from "./fallbackEngine";

interface OtpRecord {
  codeHash: string;
  expiresAt: number;
  attemptsRemaining: number;
}

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;

/**
 * In-memory store for demo purposes only.
 * In production, back this with Redis so multiple auth-service
 * replicas share OTP state (see packages/database for the schema
 * this should eventually move to for audit purposes).
 */
const otpStore = new Map<string, OtpRecord>();

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function generateCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

export class OtpService {
  private readonly fallbackEngine: OtpFallbackEngine;

  constructor(fallbackEngine?: OtpFallbackEngine) {
    this.fallbackEngine = fallbackEngine ?? new OtpFallbackEngine();
  }

  async requestOtp(phoneNumber: string): Promise<FallbackResult> {
    const code = generateCode();

    otpStore.set(phoneNumber, {
      codeHash: hashCode(code),
      expiresAt: Date.now() + OTP_TTL_MS,
      attemptsRemaining: MAX_VERIFY_ATTEMPTS,
    });

    return this.fallbackEngine.deliver(phoneNumber, code);
  }

  verifyOtp(phoneNumber: string, submittedCode: string): { valid: boolean; reason?: string } {
    const record = otpStore.get(phoneNumber);

    if (!record) {
      return { valid: false, reason: "no_active_otp" };
    }

    if (Date.now() > record.expiresAt) {
      otpStore.delete(phoneNumber);
      return { valid: false, reason: "expired" };
    }

    if (record.attemptsRemaining <= 0) {
      otpStore.delete(phoneNumber);
      return { valid: false, reason: "too_many_attempts" };
    }

    const isMatch = hashCode(submittedCode) === record.codeHash;

    if (!isMatch) {
      record.attemptsRemaining -= 1;
      return { valid: false, reason: "mismatch" };
    }

    otpStore.delete(phoneNumber);
    return { valid: true };
  }
}
