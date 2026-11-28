/*
 * NOT PART OF THE INTERVIEW: production version.
 * The entry file of the library. The React wrapper is in `react.tsx`.
 */
export { createAnalytics } from "./createAnalytics";
export { isValidEventName } from "./eventNames";
export { buildLoaderSnippet, startFromStub } from "./loader";
export type { AnalyticsStub, LoaderOptions } from "./loader";
export { dataLayerDestination } from "./plugins/dataLayerDestination";
export { scrubPageUrls, stripQueryAndHash } from "./scrub";
export { fetchTransport } from "./transport";
export type {
  Analytics,
  AnalyticsEvent,
  AnalyticsOptions,
  Batch,
  Consent,
  ErrorSource,
  EventMap,
  Plugin,
  Properties,
  SendResult,
  Stats,
  StubCall,
  Transport,
} from "./types";
