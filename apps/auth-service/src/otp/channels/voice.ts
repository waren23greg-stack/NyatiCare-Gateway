import axios from "axios";
import { OtpChannel, OtpChannelResult } from "@nyaticare/core-architecture";

/**
 * Last-resort OTP channel. Triggers an automated IVR call that reads
 * the code aloud. Used only when SMS and WhatsApp both fail — this
 * keeps a doctor able to verify a patient even during a full network
 * degradation on data channels.
 */
export class VoiceChannel implements OtpChannel {
  public readonly name = "voice";

  private readonly providerKey = process.env.VOICE_IVR_PROVIDER_KEY ?? "";

  async send(phoneNumber: string, code: string): Promise<OtpChannelResult> {
    const startedAt = Date.now();
    try {
      // NOTE: Replace with the real IVR provider's call-initiation request.
      await axios.post(
        "https://ivr-provider.example.com/v1/calls",
        {
          to: phoneNumber,
          script: `Your NyatiCare verification code is: ${code.split("").join(", ")}`,
        },
        {
          headers: { Authorization: `Bearer ${this.providerKey}` },
          timeout: Number(process.env.OTP_TIMEOUT_MS ?? 1800) * 2, // voice setup is slower
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
        error: error instanceof Error ? error.message : "unknown_voice_error",
      };
    }
  }
}
