/* NOT PART OF THE INTERVIEW: production version. */
import type { AnalyticsEvent } from "./types";

/** Cuts a URL at the first "?" or "#". */
export function stripQueryAndHash(url: string): string {
  const end = url.search(/[?#]/);
  return end === -1 ? url : url.slice(0, end);
}

/** The default `beforeSend`: page events lose the query string and the hash of their URLs. */
export function scrubPageUrls(event: AnalyticsEvent): AnalyticsEvent {
  if (event.type !== "page") {
    return event;
  }
  const properties = { ...event.properties };
  for (const key of ["url", "referrer"]) {
    const value = properties[key];
    if (typeof value === "string") {
      properties[key] = stripQueryAndHash(value);
    }
  }
  return { ...event, properties };
}
