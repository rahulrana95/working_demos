/* NOT PART OF THE INTERVIEW: production version. */
import type { Analytics, Stats } from "./types";

const doNothing = () => {};
const EMPTY_STATS: Stats = { queued: 0, sent: 0, retried: 0, dropped: 0, lastError: null };

/**
 * A client that does nothing. Used on the server, after an error at start,
 * and by `useAnalytics` when there is no provider. It lives in its own file,
 * so the React entry does not pull in the whole SDK.
 */
export const NOOP_ANALYTICS: Analytics = {
  track: doNothing,
  identify: doNothing,
  page: doNothing,
  flush: () => Promise.resolve(),
  setConsent: doNothing,
  optOut: doNothing,
  optIn: doNothing,
  use: doNothing,
  getStats: () => ({ ...EMPTY_STATS }),
  replay: doNothing,
  shutdown: doNothing,
};
