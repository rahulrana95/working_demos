/*
 * NOT PART OF THE INTERVIEW: production version.
 * Keeps the last menu of each restaurant, in memory and in sessionStorage.
 * The page shows the saved menu at once and asks the server for a fresh one
 * at the same time ("stale while revalidate"). Offline, the saved menu is
 * all the user has, and it is much better than an error.
 *
 * A saved price can be old. That is safe: the server checks every price when
 * the order is placed (see cartChanges.ts).
 */
import type { MenuCategory } from "./types";

const memory = new Map<string, MenuCategory[]>();

function storageKey(restaurantId: string): string {
  return `menu:${restaurantId}`;
}

function isMenu(value: unknown): value is MenuCategory[] {
  return (
    Array.isArray(value) &&
    value.every((category: Partial<MenuCategory> | null) => Array.isArray(category?.items))
  );
}

export function readCachedMenu(restaurantId: string): MenuCategory[] | null {
  const inMemory = memory.get(restaurantId);
  if (inMemory !== undefined) {
    return inMemory;
  }
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(storageKey(restaurantId)) ?? "null");
    if (!isMenu(saved)) {
      return null;
    }
    memory.set(restaurantId, saved);
    return saved;
  } catch {
    return null;
  }
}

export function writeCachedMenu(restaurantId: string, categories: MenuCategory[]): void {
  memory.set(restaurantId, categories);
  try {
    sessionStorage.setItem(storageKey(restaurantId), JSON.stringify(categories));
  } catch {
    // Storage is full or blocked. The copy in memory still works until a reload.
  }
}

/** Forgets every saved menu, for example on logout. sessionStorage is cleared by the caller. */
export function clearMenuMemory(): void {
  memory.clear();
}
