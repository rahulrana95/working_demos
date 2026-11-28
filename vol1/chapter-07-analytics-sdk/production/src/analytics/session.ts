/* NOT PART OF THE INTERVIEW: production version. */
import { uuid } from "./uuid";

export const SESSION_IDLE_MS = 30 * 60 * 1000;

export interface Session {
  id: string;
  lastSeenAt: number;
}

/** Returns the session for an event at `now`: the same one, or a new one after 30 idle minutes. */
export function nextSession(current: Session | null, now: number): Session {
  const isAlive = current !== null && now - current.lastSeenAt < SESSION_IDLE_MS;
  return { id: isAlive ? current.id : uuid(), lastSeenAt: now };
}

/**
 * Says whether a session is in the sample. `sampleRate` 0.1 keeps one session in ten.
 *
 * Why it holds at scale: the answer comes from the session id, so all events
 * of a session are kept or all are left out, in every tab, and a funnel is
 * never cut in the middle. The first 8 characters of a random UUID are a
 * random number from 0 to 2^32 - 1.
 */
export function isSampled(sessionId: string, sampleRate: number): boolean {
  return parseInt(sessionId.slice(0, 8), 16) / 2 ** 32 < sampleRate;
}

/** Reads a stored session. Returns null for anything that is not one. */
export function parseSession(text: string | null): Session | null {
  try {
    const value = JSON.parse(text ?? "null") as Partial<Session> | null;
    return typeof value?.id === "string" && typeof value.lastSeenAt === "number"
      ? { id: value.id, lastSeenAt: value.lastSeenAt }
      : null;
  } catch {
    return null;
  }
}
