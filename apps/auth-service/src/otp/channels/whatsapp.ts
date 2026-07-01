import axios from "axios";
import { OtpChannel, OtpChannelResult } from "@nyaticare/core-architecture";

/**
 * Secondary OTP channel. Used automatically when the SMS channel
 * exceeds the configured latency threshold or returns an error.
 */
export class WhatsAppChannel implements OtpChannel {
  public readonly name = "whatsapp";

  private readonly token = process.env.WHATSAPP_BUSINESS_TOKEN ?? "";
  private readonly phoneId = process.env.WHATSAPP_PHONE_ID ?? "";

  async send(phoneNumber: string, code: string): Promise<OtpChannelResult> {
    const startedAt = Date.now();
    try {
      // NOTE: Replace with the real WhatsApp Cloud API template message call.
      await axios.post(
        `https://graph.facebook.com/v19.0/${this.phoneId}/messages`,
        {
          messaging_product: "whatsapp",
          to: phoneNumber,
          type: "template",
          template: {
            name: "nyaticare_otp",
            language: { code: "en" },
            components: [
              {
                type: "body",
                parameters: [{ type: "text", text: code }],
              },
            ],
          },
        },
        {
          headers: { Authorization: `Bearer ${this.token}` },
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
        error: error instanceof Error ? error.message : "unknown_whatsapp_error",
      };
    }
  }
}
