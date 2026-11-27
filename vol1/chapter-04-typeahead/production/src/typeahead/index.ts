/* NOT PART OF THE INTERVIEW: production version. It only makes imports shorter. */
export { Typeahead } from "./Typeahead";
export type { TypeaheadProps } from "./Typeahead";
export { useTypeahead } from "./useTypeahead";
export type { SearchFn, TypeaheadErrorReason, TypeaheadEvent, TypeaheadStatus } from "./types";
export { DEFAULT_MESSAGES } from "./messages";
export type { TypeaheadMessages } from "./messages";
export { MAX_RETRY_WAIT_MS, RetryLaterError } from "./retryLaterError";
export { clearSharedCaches } from "./sharedCache";
export { countGraphemes, normaliseQuery } from "./text";
