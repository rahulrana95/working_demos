/* NOT PART OF THE INTERVIEW: production version. */
import type { Plugin } from "../types";

/**
 * An example of a destination plugin. It hands every event to the
 * `dataLayer` array that a tag manager reads, so one `track` call feeds both
 * tools. Only the name and the properties are handed over: the ids stay with
 * our collector.
 */
export function dataLayerDestination(target: unknown[]): Plugin {
  return {
    name: "data-layer",
    deliver: (event) => {
      target.push({ event: event.name, ...event.properties });
    },
  };
}
