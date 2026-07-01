import axios from "axios";
import { OtpChannel, OtpChannelResult } from "../../../../../packages/core-architecture/src/types";

/**
 * Primary OTP channel. Talks to the configured SMS aggregator/gateway.
 * This is the channel most prone to timeouts under load — the fallback
 * engine watches its latency and error rate closely.
 */
export class SmsChannel implements OtpChannel {
  public readonly name = "sms";

  private readonly baseUrl = process.env.SMS_GATEWAY_URL ?? "";
  private readonly apiKey = process.env.SMS_GATEWAY_API_KEY ?? "";

  async send(phoneNumber: string, code: string): Promise<OtpChannelResult> {
    const startedAt = Date.now();
    try {
      // NOTE: Replace with the real aggregator's request shape once selected.
      await axios.post(
        `${this.baseUrl}/v1/messages`,
        {
          to: phoneNumber,
          message: `Your NyatiCare verification code is ${code}. It expires in 5 minutes.`,
        },
        {
          headers: { Authorization: `Bearer ${this.apiKey}` },
          timeout: Number(process.env.OTP_TIMEOUT_MS ?? 1800),
        }
      );

      return {
        channel: this.name,
        success: true,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        channel: this.name,
        success: false,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "unknown_sms_error",
      };
    }
  }
}
