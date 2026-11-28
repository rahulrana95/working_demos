/* NOT PART OF THE INTERVIEW: production version. */
import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { NOOP_ANALYTICS } from "./noop";
import type { Analytics, EventMap } from "./types";

const AnalyticsContext = createContext<Analytics>(NOOP_ANALYTICS);

export interface AnalyticsProviderProps {
  /** Made once with `createAnalytics`, outside of any component. */
  client: Analytics<never>;
  children: ReactNode;
}

export function AnalyticsProvider({ client, children }: AnalyticsProviderProps) {
  return (
    <AnalyticsContext.Provider value={client as unknown as Analytics}>
      {children}
    </AnalyticsContext.Provider>
  );
}

/**
 * Returns the client of the nearest provider. With no provider it returns a
 * client that does nothing: a missing provider must not break the page.
 */
export function useAnalytics<Events extends object = EventMap>(): Analytics<Events> {
  // The cast is the same as in `createAnalytics`: `Events` only limits what the caller may write.
  return useContext(AnalyticsContext) as unknown as Analytics<Events>;
}
