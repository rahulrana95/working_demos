/*
 * NOT PART OF THE INTERVIEW: production version.
 * Loads the menu. A saved menu is shown at once, and the fresh one replaces
 * it when it arrives. A request with no answer in 10 seconds is a failure.
 */
import { useEffect, useState } from "react";
import { readCachedMenu, writeCachedMenu } from "./menuCache";
import { withTimeout } from "./timeout";
import type { FetchMenu, MenuCategory } from "./types";
import { useLatest } from "./useLatest";

export const MENU_TIMEOUT_MS = 10_000;

export type MenuState =
  | { status: "loading" }
  | { status: "error" }
  /** `isSaved` is true while the menu on screen is the saved one, not a fresh one. */
  | { status: "ready"; categories: MenuCategory[]; isSaved: boolean };

function savedState(restaurantId: string): MenuState {
  const saved = readCachedMenu(restaurantId);
  return saved === null
    ? { status: "loading" }
    : { status: "ready", categories: saved, isSaved: true };
}

export function useMenu(restaurantId: string, fetchMenu: FetchMenu) {
  // The state remembers which restaurant it is for. So the menu of the last
  // restaurant is never shown under the new one, not even for one frame.
  const [state, setState] = useState(() => ({ restaurantId, menu: savedState(restaurantId) }));
  const [attempt, setAttempt] = useState(0);
  const fetchMenuRef = useLatest(fetchMenu);

  useEffect(() => {
    const controller = new AbortController();
    const saved = savedState(restaurantId);
    setState({ restaurantId, menu: saved });

    withTimeout(
      (signal) => fetchMenuRef.current(restaurantId, signal),
      MENU_TIMEOUT_MS,
      controller.signal,
    ).then(
      (categories) => {
        if (!controller.signal.aborted) {
          writeCachedMenu(restaurantId, categories);
          setState({ restaurantId, menu: { status: "ready", categories, isSaved: false } });
        }
      },
      () => {
        // With a saved menu on screen, a failed refresh changes nothing. A failure is never saved.
        if (!controller.signal.aborted && saved.status !== "ready") {
          setState({ restaurantId, menu: { status: "error" } });
        }
      },
    );

    // An answer for an old restaurant, or after the page is gone, is ignored.
    return () => controller.abort();
  }, [restaurantId, attempt, fetchMenuRef]);

  const menu = state.restaurantId === restaurantId ? state.menu : savedState(restaurantId);
  return { menu, retry: () => setAttempt((count) => count + 1) };
}
