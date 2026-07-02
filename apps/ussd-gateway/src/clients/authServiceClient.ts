import axios from "axios";

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? "http://auth-service:4001";

export interface OtpVerifyResult {
  valid: boolean;
}

export async function verifyOtpCode(phoneNumber: string, code: string): Promise<OtpVerifyResult> {
  try {
    await axios.post(
      `${AUTH_SERVICE_URL}/api/v1/auth/otp/verify`,
      { phoneNumber, code },
      { timeout: 4000 }
    );
    return { valid: true };
  } catch (error) {
    // A 401 (wrong/expired code) and a network failure both just mean
    // "we can't confirm this code" from the caller's point of view.
    return { valid: false };
  }
}
