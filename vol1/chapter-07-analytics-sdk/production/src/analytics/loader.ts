/* NOT PART OF THE INTERVIEW: production version. */
import { createAnalytics } from "./createAnalytics";
import type { Analytics, AnalyticsOptions, StubCall } from "./types";

/** The methods that work before the SDK has loaded. */
export const STUB_METHODS = [
  "track",
  "identify",
  "page",
  "flush",
  "setConsent",
  "optOut",
  "optIn",
] as const;

/** What the loader snippet puts on the page: methods that only record the call. */
export type AnalyticsStub = { calls: StubCall[] } & Record<
  (typeof STUB_METHODS)[number],
  (...args: unknown[]) => void
>;

export interface LoaderOptions {
  /** The URL of the UMD build of the SDK. */
  src: string;
  /** The name of the global variable. Default "analytics". */
  globalName?: string;
  endpoint: string;
  writeKey: string;
}

/**
 * Returns the JavaScript text a team pastes into a `<script>` tag in the
 * `<head>` of its page.
 *
 * The snippet is small and runs at once. It makes a stub whose methods only
 * record each call with its time, and it loads the SDK with an `async`
 * script, which does not block the page. When the SDK has loaded, it runs
 * the recorded calls. If the script never loads (an ad blocker, a network
 * error), the stub keeps recording at most `maxCalls` calls and nothing
 * else happens: the page is not affected.
 *
 * It is written in old JavaScript on purpose. No build step changes it, so
 * it must run as it is in every browser.
 */
export function buildLoaderSnippet(
  { src, globalName = "analytics", endpoint, writeKey }: LoaderOptions,
  maxCalls = 500,
): string {
  const settings = JSON.stringify({ endpoint, writeKey });
  return `(function (w, d, name) {
  if (w[name]) return;
  var stub = (w[name] = { calls: [] });
  ${JSON.stringify(STUB_METHODS)}.forEach(function (method) {
    stub[method] = function () {
      if (stub.calls.length < ${maxCalls}) {
        stub.calls.push({ method: method, args: [].slice.call(arguments), at: Date.now() });
      }
    };
  });
  var script = d.createElement("script");
  script.async = true;
  script.src = ${JSON.stringify(src)};
  script.onload = function () {
    if (w.AnalyticsSdk) w.AnalyticsSdk.startFromStub(stub, ${settings});
  };
  d.head.appendChild(script);
})(window, document, ${JSON.stringify(globalName)});`;
}

/**
 * Starts the SDK and runs the calls that the stub recorded. After this, the
 * methods of the stub call the SDK, so code that kept the stub keeps working.
 */
export function startFromStub(stub: AnalyticsStub, options: AnalyticsOptions): Analytics {
  const analytics = createAnalytics(options);
  try {
    const calls = Array.isArray(stub.calls) ? stub.calls.splice(0) : [];
    analytics.replay(calls);
    Object.assign(stub, analytics);
  } catch {
    // A broken stub must not stop the SDK or the page.
  }
  return analytics;
}
