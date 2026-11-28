/*
 * NOT PART OF THE INTERVIEW: production version.
 * The small store that holds the player state outside React. It is the same
 * store as in the interview answers, in its own file.
 *
 * Why it holds at scale: a component reads one value from the store, and
 * React draws that component again only when that value changes. "timeupdate"
 * fires 4 to 66 times a second, and only the seek bar reads the time.
 */
import { useSyncExternalStore } from "react";
import { INITIAL_STATE, reducePlayer } from "./playerMachine";
import type { PlayerEvent, PlayerState } from "./playerMachine";

export function createPlayerStore() {
  let state = INITIAL_STATE;
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    dispatch(event: PlayerEvent) {
      const nextState = reducePlayer(state, event);
      // The machine returns the same object when the event changes nothing.
      if (nextState !== state) {
        state = nextState;
        listeners.forEach((listener) => listener());
      }
    },
  };
}

export type PlayerStore = ReturnType<typeof createPlayerStore>;

/** Reads one value from the store. The component is drawn again only when that value changes. */
export function usePlayerValue<T>(store: PlayerStore, select: (state: PlayerState) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(store.getState()));
}
