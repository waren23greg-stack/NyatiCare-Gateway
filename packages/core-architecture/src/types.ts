export interface OtpChannelResult {
  channel: string;
  success: boolean;
  latencyMs: number;
  error?: string;
}

export interface OtpChannel {
  name: string;
  send(phoneNumber: string, code: string): Promise<OtpChannelResult>;
}

export interface PatientRecord {
  nationalId: string;
  shaNumber: string;
  fullName: string;
  facilityCode: string;
}

export type ClaimStatus =
  | "queued"
  | "signed_offline"
  | "submitted"
  | "acknowledged"
  | "rejected";

export interface Claim {
  claimId: string;
  facilityCode: string;
  patientNationalId: string;
  amount: number;
  currency: "KES";
  status: ClaimStatus;
  createdAt: string;
  submittedAt?: string;
  signatureHash: string;
}

export interface HealthCheckResponse {
  service: string;
  status: "ok" | "degraded" | "down";
  dependencies?: Record<string, "ok" | "degraded" | "down">;
}
