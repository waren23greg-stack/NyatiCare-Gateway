import { OtpChannel, OtpChannelResult } from "@nyaticare/core-architecture";
import { SmsChannel } from "./channels/sms";
import { WhatsAppChannel } from "./channels/whatsapp";
import { VoiceChannel } from "./channels/voice";

export interface FallbackAttempt {
  channel: string;
  success: boolean;
  latencyMs: number;
  error?: string;
}

export interface FallbackResult {
  delivered: boolean;
  deliveredVia: string | null;
  attempts: FallbackAttempt[];
}

/**
 * Multi-Channel Fallback Authentication Engine.
 *
 * Tries channels in priority order (SMS -> WhatsApp -> Voice). Each
 * channel call is itself time-boxed (see OTP_TIMEOUT_MS), so a hung
 * SMS gateway can't block the whole verification flow — it simply
 * fails fast and cedes to the next channel.
 */
export class OtpFallbackEngine {
  private readonly channels: OtpChannel[];

  constructor(channels?: OtpChannel[]) {
    this.channels = channels ?? [new SmsChannel(), new WhatsAppChannel(), new VoiceChannel()];
  }

  async deliver(phoneNumber: string, code: string): Promise<FallbackResult> {
    const attempts: FallbackAttempt[] = [];

    for (const channel of this.channels) {
      const result: OtpChannelResult = await channel.send(phoneNumber, code);
      attempts.push({
        channel: result.channel,
        success: result.success,
        latencyMs: result.latencyMs,
        error: result.error,
      });

      if (result.success) {
        return { delivered: true, deliveredVia: result.channel, attempts };
      }
    }

    return { delivered: false, deliveredVia: null, attempts };
  }
}
