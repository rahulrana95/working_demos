/*
 * NOT PART OF THE INTERVIEW.
 * Fakes that the tests share: a transport answered by hand, a fake
 * `sendBeacon`, and a way to hide the page.
 */
import type { Batch, SendResult, Transport } from "./types";

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
      // Like `fetch`: an aborted request rejects.
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
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
