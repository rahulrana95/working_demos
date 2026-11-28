/* NOT PART OF THE INTERVIEW: production version. Small helpers that the tests share. */
import { act } from "@testing-library/react";
import type { MenuCategory, MenuItem, Order, OrderStatus } from "./ordering";

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
}

/** A promise that the test resolves by hand, to control the order of answers. */
export function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Moves the fake clock forward and lets React finish its updates. */
export async function wait(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Lets promises that are already resolved run their callbacks. */
export function flush(): Promise<void> {
  return wait(0);
}

/** Makes the tab hidden or visible, as the browser does when the user switches tabs. */
export async function setTabHidden(hidden: boolean): Promise<void> {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

export function makeItem(id: string, price: number, extra: Partial<MenuItem> = {}): MenuItem {
  return { id, name: id, description: "", price, isVeg: true, available: true, ...extra };
}

export const TIKKA = makeItem("tikka", 22000, { name: "Paneer Tikka" });
export const NAAN = makeItem("naan", 6000, { name: "Butter Naan" });
export const BIRYANI = makeItem("biryani", 28000, { name: "Biryani", available: false });

export const MENU: MenuCategory[] = [
  { id: "starters", name: "Starters", items: [TIKKA] },
  { id: "mains", name: "Main course", items: [NAAN, BIRYANI] },
];

export function makeOrder(status: OrderStatus, updatedAt: number, etaMinutes = 30): Order {
  return { id: "1001", status, etaMinutes, updatedAt };
}
