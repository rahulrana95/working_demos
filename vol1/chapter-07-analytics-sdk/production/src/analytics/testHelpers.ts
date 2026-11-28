/*
 * NOT PART OF THE INTERVIEW.
 * Fakes that the tests share: a transport answered by hand, a fake
 * `sendBeacon`, fake Web Locks, and a way to hide the page.
 */
import { createAnalytics } from "./createAnalytics";
import type {
  Analytics,
  AnalyticsEvent,
  AnalyticsOptions,
  Batch,
  SendResult,
  Transport,
} from "./types";

export interface FakeCall {
  url: string;
  batch: Batch;
  signal: AbortSignal;
  resolve: (result: SendResult) => void;
  reject: (error: Error) => void;
}

/** A transport that records each call and waits for the test to answer it. */
export function createFakeTransport() {
  const calls: FakeCall[] = [];
  const transport: Transport = (url, body, signal) =>
    new Promise<SendResult>((resolve, reject) => {
      calls.push({ url, batch: JSON.parse(body) as Batch, signal, resolve, reject });
    });

  /** Answers the newest call and lets the SDK handle the answer. */
  async function answer(result: SendResult): Promise<void> {
    calls[calls.length - 1].resolve(result);
    await vi.advanceTimersByTimeAsync(0);
  }

  return { transport, calls, answer };
}

/** Replaces `navigator.sendBeacon` and returns the batches it was given. */
export function installFakeBeacon(accepts: () => boolean = () => true) {
  const batches: Batch[] = [];
  const sendBeacon = vi.fn((_url: string, body: string) => {
    if (!accepts()) {
      return false;
    }
    batches.push(JSON.parse(body) as Batch);
    return true;
  });
  Object.defineProperty(navigator, "sendBeacon", { value: sendBeacon, configurable: true });
  return { batches, sendBeacon };
}

export function removeFakeBeacon(): void {
  Reflect.deleteProperty(navigator, "sendBeacon");
}

/** Makes the page hidden or visible, the way a tab switch does. */
export function setVisibility(state: "hidden" | "visible"): void {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

type Listener = Parameters<typeof window.addEventListener>;

/**
 * The SDK adds page listeners and never removes them. This records them, so
 * that an SDK made in one test does not answer the events of the next test.
 */
export function trackPageListeners() {
  const added: Array<[EventTarget, Listener]> = [];
  for (const target of [window, document]) {
    const original = target.addEventListener.bind(target);
    vi.spyOn(target, "addEventListener").mockImplementation((...args: Listener) => {
      added.push([target, args]);
      original(...args);
    });
  }

  return {
    names: () => added.map(([, args]) => args[0]),
    removeAll: () => {
      for (const [target, args] of added) {
        target.removeEventListener(args[0], args[1]);
      }
      added.length = 0;
    },
  };
}

/**
 * Replaces `navigator.locks` with a fake that runs one callback at a time,
 * in the order of the requests, like the real one does for one lock name.
 */
export function installFakeLocks() {
  const names: string[] = [];
  let tail: Promise<void> = Promise.resolve();
  const request = vi.fn((name: string, callback: () => Promise<void>) => {
    names.push(name);
    tail = tail.then(callback);
    return tail;
  });
  Object.defineProperty(navigator, "locks", { value: { request }, configurable: true });
  return { names, request };
}

export function removeFakeLocks(): void {
  Reflect.deleteProperty(navigator, "locks");
}

/** Makes an SDK with a fake transport. Each call stands for one tab or one page load. */
export function openTab(options: Partial<AnalyticsOptions> = {}) {
  const fake = createFakeTransport();
  const analytics = createAnalytics({
    endpoint: "https://collector.test/v1/batch",
    writeKey: "key_1",
    transport: fake.transport,
    // Off, so a test sees only the events it makes itself. `pageTracking.test.ts` turns it on.
    trackPages: false,
    ...options,
  });
  return { analytics, ...fake };
}

/** Lets the SDK do the work it keeps for an idle moment. */
export async function idle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

export function trackMany(analytics: Analytics, count: number, name = "clicked"): void {
  for (let index = 0; index < count; index += 1) {
    analytics.track(name, { index });
  }
}

/** The keys in `localStorage` that hold a stored queue. */
export function storedQueueKeys(): string[] {
  return Object.keys(localStorage).filter((key) => key.startsWith("analytics:queue:"));
}

/** Every event in every stored queue. */
export function storedEvents(): AnalyticsEvent[] {
  return storedQueueKeys().flatMap(
    (key) => (JSON.parse(localStorage.getItem(key) ?? "{}") as { events: AnalyticsEvent[] }).events,
  );
}

/** The set-up that the test files of the SDK share. */
export function useSdkTestSetup(): void {
  const state: { listeners: ReturnType<typeof trackPageListeners> | null } = { listeners: null };

  beforeEach(() => {
    vi.useFakeTimers();
    // With 1, the random part of every retry wait is at its largest: 1 s, 2 s, 4 s, ...
    vi.spyOn(Math, "random").mockReturnValue(1);
    localStorage.clear();
    history.replaceState(null, "", "/");
    state.listeners = trackPageListeners();
    setVisibility("visible");
  });

  afterEach(() => {
    state.listeners?.removeAll();
    removeFakeBeacon();
    removeFakeLocks();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
}
