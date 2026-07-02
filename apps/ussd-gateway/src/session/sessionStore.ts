export type UssdStep =
  | "MAIN_MENU"
  | "AWAITING_NATIONAL_ID"
  | "AWAITING_OTP_CODE";

export interface UssdSession {
  step: UssdStep;
  data: Record<string, string>;
}

/**
 * In-memory session state, keyed by Africa's Talking' sessionId.
 *
 * This works for a single running instance, which is fine for a
 * pilot. The moment this service needs more than one replica (see
 * the autoscaling pattern used by the other services), this needs to
 * move to Redis instead — sessions must be visible to whichever
 * replica handles the next request in the same USSD session, and two
 * separate phones dialing in at once could land on different
 * containers. Tracked in the roadmap.
 */
const sessions = new Map<string, UssdSession>();

const SESSION_TTL_MS = 3 * 60 * 1000; // USSD sessions are short-lived by nature
const sessionTimers = new Map<string, NodeJS.Timeout>();

export function getSession(sessionId: string): UssdSession {
  const existing = sessions.get(sessionId);
  if (existing) return existing;

  const fresh: UssdSession = { step: "MAIN_MENU", data: {} };
  sessions.set(sessionId, fresh);
  return fresh;
}

export function updateSession(sessionId: string, session: UssdSession): void {
  sessions.set(sessionId, session);

  const existingTimer = sessionTimers.get(sessionId);
  if (existingTimer) clearTimeout(existingTimer);

  sessionTimers.set(
    sessionId,
    setTimeout(() => endSession(sessionId), SESSION_TTL_MS)
  );
}

export function endSession(sessionId: string): void {
  sessions.delete(sessionId);
  const timer = sessionTimers.get(sessionId);
  if (timer) clearTimeout(timer);
  sessionTimers.delete(sessionId);
}
