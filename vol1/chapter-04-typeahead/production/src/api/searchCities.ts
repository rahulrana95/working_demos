/*
 * NOT PART OF THE INTERVIEW: production version.
 * A fake server for the demo. It answers after a random delay, so an older
 * request can finish after a newer one, like on a real network.
 * The production demo can also make it very slow, or make it say "try later".
 */
import { RetryLaterError } from "../typeahead";
import type { SearchFn } from "../typeahead";

export interface City {
  id: string;
  name: string;
  state: string;
}

const CITIES: City[] = [
  { id: "agr", name: "Agra", state: "Uttar Pradesh" },
  { id: "amd", name: "Ahmedabad", state: "Gujarat" },
  { id: "atq", name: "Amritsar", state: "Punjab" },
  { id: "blr", name: "Bengaluru", state: "Karnataka" },
  { id: "bho", name: "Bhopal", state: "Madhya Pradesh" },
  { id: "bbi", name: "Bhubaneswar", state: "Odisha" },
  { id: "ixc", name: "Chandigarh", state: "Chandigarh" },
  { id: "maa", name: "Chennai", state: "Tamil Nadu" },
  { id: "cjb", name: "Coimbatore", state: "Tamil Nadu" },
  { id: "ded", name: "Dehradun", state: "Uttarakhand" },
  { id: "del", name: "Delhi", state: "Delhi" },
  { id: "gau", name: "Guwahati", state: "Assam" },
  { id: "gwl", name: "Gwalior", state: "Madhya Pradesh" },
  { id: "hyd", name: "Hyderabad", state: "Telangana" },
  { id: "idr", name: "Indore", state: "Madhya Pradesh" },
  { id: "jai", name: "Jaipur", state: "Rajasthan" },
  { id: "jdh", name: "Jodhpur", state: "Rajasthan" },
  { id: "knu", name: "Kanpur", state: "Uttar Pradesh" },
  { id: "cok", name: "Kochi", state: "Kerala" },
  { id: "ccu", name: "Kolkata", state: "West Bengal" },
  { id: "lko", name: "Lucknow", state: "Uttar Pradesh" },
  { id: "luh", name: "Ludhiana", state: "Punjab" },
  { id: "ixm", name: "Madurai", state: "Tamil Nadu" },
  { id: "ixe", name: "Mangaluru", state: "Karnataka" },
  { id: "bom", name: "Mumbai", state: "Maharashtra" },
  { id: "mun", name: "Munnar", state: "Kerala" },
  { id: "myq", name: "Mysuru", state: "Karnataka" },
  { id: "nag", name: "Nagpur", state: "Maharashtra" },
  { id: "isk", name: "Nashik", state: "Maharashtra" },
  { id: "pat", name: "Patna", state: "Bihar" },
  { id: "pnq", name: "Pune", state: "Maharashtra" },
  { id: "rpr", name: "Raipur", state: "Chhattisgarh" },
  { id: "raj", name: "Rajkot", state: "Gujarat" },
  { id: "ixr", name: "Ranchi", state: "Jharkhand" },
  { id: "stv", name: "Surat", state: "Gujarat" },
  { id: "trv", name: "Thiruvananthapuram", state: "Kerala" },
  { id: "udr", name: "Udaipur", state: "Rajasthan" },
  { id: "bdq", name: "Vadodara", state: "Gujarat" },
  { id: "vns", name: "Varanasi", state: "Uttar Pradesh" },
  { id: "vtz", name: "Visakhapatnam", state: "Andhra Pradesh" },
];

const MIN_DELAY_MS = 150;
const MAX_DELAY_MS = 700;
/** Longer than the 5 second timeout of the typeahead. */
const VERY_SLOW_DELAY_MS = 10_000;
const RETRY_AFTER_MS = 1000;

export interface FakeServerOptions {
  /** Return true to make the next request fail. */
  shouldFail: () => boolean;
  /** Return true to answer "try later" (status 429) once, and then answer normally. */
  shouldRateLimit: () => boolean;
  /** Return true to make the next request slower than the timeout. */
  shouldBeVerySlow: () => boolean;
  /** Called once for every request that reaches the "server". */
  onRequest: (query: string) => void;
}

/**
 * Builds a search function that behaves like a real server.
 *
 * Every request takes a random amount of time. So a request sent earlier can
 * finish later, which is exactly the race condition the typeahead must handle.
 */
export function createCitySearch({
  shouldFail,
  shouldRateLimit,
  shouldBeVerySlow,
  onRequest,
}: FakeServerOptions): SearchFn<City> {
  // True right after a "try later" answer, so the retry gets a normal answer.
  let hasJustRateLimited = false;

  return (query, signal) =>
    new Promise<City[]>((resolve, reject) => {
      onRequest(query);

      const delayMs = shouldBeVerySlow()
        ? VERY_SLOW_DELAY_MS
        : MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);

      const timerId = setTimeout(() => {
        if (shouldRateLimit() && !hasJustRateLimited) {
          hasJustRateLimited = true;
          reject(new RetryLaterError(RETRY_AFTER_MS));
          return;
        }
        hasJustRateLimited = false;

        if (shouldFail()) {
          reject(new Error("The server did not respond"));
          return;
        }

        const needle = query.toLowerCase();
        resolve(CITIES.filter((city) => city.name.toLowerCase().includes(needle)));
      }, delayMs);

      signal.addEventListener("abort", () => {
        clearTimeout(timerId);
        reject(new DOMException("The request was cancelled", "AbortError"));
      });
    });
}
