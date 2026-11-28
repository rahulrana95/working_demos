/*
 * PART OF THE INTERVIEW: yes (about 5 minutes).
 * Write these types first. They are the contract with the product teams and
 * with the collector.
 */

export type Properties = Record<string, unknown>;

/** The events of one product: each name with the type of its properties. */
export type EventMap = Record<string, Properties>;

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
 *   "retry": it may work later (network error, 5xx, 408, 429).
 *   "drop":  it will never work (any other 4xx). The batch is thrown away.
 * A transport that throws, or rejects, counts as "retry".
 */
export type SendResult = { kind: "ok" } | { kind: "retry" } | { kind: "drop" };

/**
 * Sends one batch. `body` is the JSON text of a `Batch`. The SDK aborts
 * `signal` after 10 seconds, and the transport must then reject.
 */
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
  /**
   * Called for every event before it is queued or stored. Return the event,
   * a changed copy, or null to drop it. If it throws, the event is dropped.
   */
  beforeSend?: (event: AnalyticsEvent) => AnalyticsEvent | null;
}

export interface Analytics<Events extends object = EventMap> {
  track<Name extends keyof Events & string>(name: Name, ...args: TrackArgs<Events[Name]>): void;
  identify(userId: string, traits?: Properties): void;
  page(name?: string): void;
  /** Sends what is waiting now. Resolves when nothing is waiting or a send failed. Never rejects. */
  flush(): Promise<void>;
  /** Stops collecting, removes what is waiting and what is stored, and remembers the choice. */
  optOut(): void;
  optIn(): void;
}
