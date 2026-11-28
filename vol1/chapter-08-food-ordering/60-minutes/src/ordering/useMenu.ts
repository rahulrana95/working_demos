/*
 * NOT PART OF THE INTERVIEW.
 * Loads the menu once. In the interview you say "the menu loads with the
 * usual loading, error and retry states" and move on to the cart.
 */
import { useEffect, useState } from "react";
import type { FetchMenu, MenuCategory } from "./types";

export type MenuState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; categories: MenuCategory[] };

export function useMenu(restaurantId: string, fetchMenu: FetchMenu) {
  // The state remembers which restaurant it is for. So the menu of the last
  // restaurant is never shown under the new one, not even for one frame.
  const [state, setState] = useState<{ restaurantId: string; menu: MenuState }>({
    restaurantId,
    menu: { status: "loading" },
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ restaurantId, menu: { status: "loading" } });

    fetchMenu(restaurantId, controller.signal).then(
      (categories) => {
        if (!controller.signal.aborted) {
          setState({ restaurantId, menu: { status: "ready", categories } });
        }
      },
      () => {
        if (!controller.signal.aborted) {
          setState({ restaurantId, menu: { status: "error" } });
        }
      },
    );

    // An answer for an old restaurant, or after the page is gone, is ignored.
    return () => controller.abort();
  }, [restaurantId, attempt, fetchMenu]);

  const menu: MenuState = state.restaurantId === restaurantId ? state.menu : { status: "loading" };
  return { menu, retry: () => setAttempt((count) => count + 1) };
}
