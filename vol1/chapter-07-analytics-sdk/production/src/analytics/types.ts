/* NOT PART OF THE INTERVIEW: production version. */

export type Properties = Record<string, unknown>;

/** The events of one product: each name with the type of its properties. */
export type EventMap = Record<string, Properties>;

/**
 * "pending": the user has not chosen yet. Events wait in memory. Nothing is sent or stored.
 * "granted": events are sent, and the queue and the ids are stored.
 * "denied":  events are thrown away, and what was stored is removed.
 */
export type Consent = "pending" | "granted" | "denied";

/** The properties are optional only when the event has no required property. */
type TrackArgs<P> = Record<string, never> extends P ? [properties?: P] : [properties: P];

/** One event, as the collector receives it. */
export interface AnalyticsEvent {
  /** Made once, kept on every retry. The collector uses it to drop a copy. */
  id: string;
  type: "track" | "page" | "identify";
  name: string;
  properties: Properties;
  /** When the event happened, in milliseconds, by the clock of the device. */
  timestamp: number;
  anonymousId: string;
  userId?: string;
  /** Changes after 30 minutes with no event. */
  sessionId: string;
}

/** The body of one request. */
export interface Batch {
  writeKey: string;
  /** When the batch left the device. The collector uses it to correct a wrong device clock. */
  sentAt: number;
  /** How many events this page has thrown away so far. */
  dropped: number;
  events: AnalyticsEvent[];
}

/**
 * What a transport tells us. The SDK never sees an HTTP status, so the
 * transport must turn the answer into one of these:
 *   "ok":    the collector has the batch.
 *   "retry": it may work later (network error, 5xx, 429). `retryAfterMs` is the wait the server asked for.
 *   "drop":  it will never work (any other 4xx). The batch is thrown away.
 * A transport that throws, or rejects, counts as "retry".
 */
export type SendResult =
  | { kind: "ok" }
  | { kind: "retry"; retryAfterMs?: number }
  | { kind: "drop" };

/** Sends one batch. `body` is the JSON text of a `Batch`. Stop when `signal` aborts. */
export type Transport = (url: string, body: string, signal: AbortSignal) => Promise<SendResult>;

export interface AnalyticsOptions {
  /** The URL of the collector. */
  endpoint: string;
  /** Says which product the events belong to. It is not a secret. */
  writeKey: string;
  /** Send what is waiting after this long. */
  flushIntervalMs?: number;
  /** Send at once when this many events are waiting. Also the most events in one request. */
  batchSize?: number;
  /** Never hold more events than this. The oldest are dropped first. */
  maxQueueSize?: number;
  /** How a batch is sent. Tests pass a fake. The default uses `fetch`. */
  transport?: Transport;
  /** Where the user's choice stands when the page loads. A stored choice wins. Default "granted". */
  consent?: Consent;
  /**
   * Called for every event before it is queued or stored. Return the event,
   * a changed copy, or null to drop it. If it throws, the event is dropped.
   * The default removes the query string from the URLs of page events.
   */
  beforeSend?: (event: AnalyticsEvent) => AnalyticsEvent | null;
  /** The share of sessions that send events, from 0 to 1. Default 1. */
  sampleRate?: number;
  /**
   * Send a page event when the SDK starts and every time the path changes
   * (`history.pushState`, `history.replaceState`, back and forward). Default true.
   */
  trackPages?: boolean;
  /** Plugins to start with. More can be added later with `use`. */
  plugins?: Plugin[];
  /**
   * Log what the SDK does to the console, and warn about event names that
   * break the naming rule. For development. Default false.
   */
  debug?: boolean;
  /**
   * Called when something failed inside the SDK, a hook, a plugin or a
   * request. The SDK has already handled it. `source` says where it happened.
   */
  onError?: (error: Error, source: ErrorSource) => void;
}

export type ErrorSource = "sdk" | "beforeSend" | "plugin" | "transport";

/**
 * A plugin adds to the SDK without a change to its code. An error in a
 * plugin never stops the event from reaching the collector, with one
 * exception: when `enrich` throws, the event is dropped, like for `beforeSend`.
 */
export interface Plugin {
  /** Shown in debug logs. */
  name: string;
  /** Changes an event, or drops it by returning null. Runs after `beforeSend`. */
  enrich?: (event: AnalyticsEvent) => AnalyticsEvent | null;
  /**
   * Gets a copy of every event the collector will get, to hand it to another
   * tool. Called only when the user has given consent.
   */
  deliver?: (event: AnalyticsEvent) => void;
}

/** Numbers for a health check. They hold counts and one message, never event data. */
export interface Stats {
  /** Events that wait in the SDK or are in a request now. */
  queued: number;
  /** Events the collector, or the browser on page exit, has accepted. */
  sent: number;
  /** Requests that failed and were put back to be sent again. */
  retried: number;
  /** Events thrown away: queue full, refused by the collector, or a failed hook. */
  dropped: number;
  /** The newest failure, or null. */
  lastError: string | null;
}

/** One call made on the loader stub before the SDK had loaded. */
export interface StubCall {
  method: string;
  args: unknown[];
  /** When the call was made, so the event keeps its real time. */
  at: number;
}

export interface Analytics<Events extends object = EventMap> {
  track<Name extends keyof Events & string>(name: Name, ...args: TrackArgs<Events[Name]>): void;
  identify(userId: string, traits?: Properties): void;
  page(name?: string): void;
  /** Sends what is waiting now. Resolves when nothing is waiting or a send failed. Never rejects. */
  flush(): Promise<void>;
  /** Records the user's choice and remembers it. */
  setConsent(choice: "granted" | "denied"): void;
  /** The same as `setConsent("denied")`. */
  optOut(): void;
  /** The same as `setConsent("granted")`. */
  optIn(): void;
  /** Adds a plugin. */
  use(plugin: Plugin): void;
  getStats(): Stats;
  /** Runs the calls that the loader stub recorded, each with its own time. */
  replay(calls: StubCall[]): void;
  /** Hands what is waiting to the browser, removes every listener and timer, and stops. */
  shutdown(): void;
}
