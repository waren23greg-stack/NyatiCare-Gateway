import { UssdSession, endSession } from "../session/sessionStore";
import { lookupPatientStatus } from "../clients/patientRegistryClient";
import { verifyOtpCode } from "../clients/authServiceClient";

export interface UssdRequest {
  sessionId: string;
  phoneNumber: string;
  /**
   * Africa's Talking sends the FULL accumulated input for the session
   * on every request, star-separated (e.g. "1*12345678"), not just the
   * latest keypress. We only care about the latest segment — the menu
   * state itself is tracked separately in sessionStore, driven by
   * `step`, not by replaying this whole string.
   */
  text: string;
}

/**
 * Returns the raw response text Africa's Talking expects:
 * - "CON <text>" keeps the session open and shows another menu/prompt.
 * - "END <text>" closes the session after showing a final message.
 */
export async function handleUssdRequest(req: UssdRequest, session: UssdSession): Promise<string> {
  const segments = req.text.split("*").filter(Boolean);
  const latestInput = segments[segments.length - 1] ?? "";

  switch (session.step) {
    case "MAIN_MENU": {
      // Empty text means this is the very first request of the
      // session (the user just dialed the code) — show the menu
      // without treating anything as a selection yet.
      if (req.text === "") {
        return renderMainMenu();
      }
      return handleMainMenuSelection(latestInput, session);
    }

    case "AWAITING_NATIONAL_ID": {
      return handleNationalIdEntry(latestInput, req.sessionId);
    }

    case "AWAITING_OTP_CODE": {
      return handleOtpCodeEntry(latestInput, req.phoneNumber, req.sessionId);
    }

    default:
      endSession(req.sessionId);
      return "END Something went wrong. Please dial in again.";
  }
}

function renderMainMenu(): string {
  return [
    "CON Welcome to NyatiCare",
    "1. Check my SHA status",
    "2. Verify OTP code",
    "3. About",
  ].join("\n");
}

function handleMainMenuSelection(choice: string, session: UssdSession): string {
  switch (choice) {
    case "1":
      session.step = "AWAITING_NATIONAL_ID";
      return "CON Enter your National ID number:";
    case "2":
      session.step = "AWAITING_OTP_CODE";
      return "CON Enter the OTP code sent to your phone:";
    case "3":
      return "END NyatiCare Gateway. An independent, open-source project. Not affiliated with SHA or the Ministry of Health.";
    default:
      return "END Invalid option. Please dial in again.";
  }
}

async function handleNationalIdEntry(nationalId: string, sessionId: string): Promise<string> {
  endSession(sessionId); // this is a one-shot lookup, no further steps needed

  if (!/^\d{6,10}$/.test(nationalId)) {
    return "END Invalid National ID format. Please dial in again.";
  }

  const result = await lookupPatientStatus(nationalId);

  if (!result.found) {
    return "END No SHA record found for that National ID.";
  }

  return [
    "END SHA Status: Registered",
    `SHA Number: ${result.shaNumber}`,
    `Facility: ${result.facilityCode}`,
  ].join("\n");
}

async function handleOtpCodeEntry(code: string, phoneNumber: string, sessionId: string): Promise<string> {
  endSession(sessionId);

  if (!/^\d{4,8}$/.test(code)) {
    return "END Invalid code format. Please dial in again.";
  }

  const result = await verifyOtpCode(phoneNumber, code);

  if (!result.valid) {
    return "END Code invalid or expired. Please request a new OTP and try again.";
  }

  return "END Verified successfully. You may proceed at the facility.";
}
