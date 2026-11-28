/*
 * NOT PART OF THE INTERVIEW: production version.
 * Every text the user can read or hear is here, in one object. Another team
 * can replace any of them to translate the pages. Prices are not here: they
 * are written by Intl.NumberFormat, in the locale the app gives.
 */
import type { OrderStatus } from "./types";

const plurals = new Intl.PluralRules("en");

export const DEFAULT_MESSAGES = {
  menuLabel: "Menu",
  loadingMenu: "Loading the menu…",
  menuError: "We could not load the menu.",
  retry: "Try again",
  categories: "Menu categories",
  searchLabel: "Search the menu",
  /** A function, because plural rules change with the language. */
  searchResults: (count: number) =>
    plurals.select(count) === "one" ? `${count} dish found` : `${count} dishes found`,
  veg: "Veg",
  nonVeg: "Non-veg",
  unavailable: "Unavailable",
  /** Functions, because the place of the name in the sentence changes with the language. */
  addItem: (name: string) => `Add ${name}`,
  removeOne: (name: string) => `Remove one ${name}`,
  quantityOf: (name: string) => `Number of ${name}`,
  itemCount: (count: number) =>
    plurals.select(count) === "one" ? `${count} item` : `${count} items`,
  cartChange: (name: string, quantity: number, total: string) =>
    `${name}: ${quantity} in the cart. Total ${total}.`,
  cartLabel: "Cart",
  placeOrder: "Place order",
  placingOrder: "Placing the order…",
  orderFailed: "We could not place the order. Your cart is safe. Try again.",
  orderTimedOut:
    "The order took too long. Your cart is safe. Try again: you will not get two orders.",
  cartChanged: "The restaurant changed something. Check your cart, then confirm.",
  priceChanged: (name: string, price: string) => `${name} now costs ${price}.`,
  itemUnavailable: (name: string) => `${name} is not available any more. We took it out.`,
  confirmOrder: "Confirm and place order",
  orderHeading: "Your order",
  loadingOrder: "Loading your order…",
  reconnecting: "Reconnecting…",
  eta: (minutes: number) => `Arriving in about ${minutes} minutes`,
  stepDone: "(done)",
  status: {
    placed: "Order placed",
    accepted: "Restaurant accepted the order",
    preparing: "Food is being prepared",
    picked_up: "Courier picked up the food",
    arriving: "Courier is nearby",
    delivered: "Delivered",
    cancelled: "Order cancelled",
  } as Record<OrderStatus, string>,
  /** `distance` is already written in the user's locale, for example "1.2". */
  courierDistance: (name: string, distance: string) => `${name} is about ${distance} km away`,
  mapUnavailable: "The map is not available.",
  offline: "You seem to be offline. We keep trying.",
  savedMenu: "This is the menu we saved earlier. A price may have changed.",
  updatedJustNow: "Updated less than a minute ago",
  /** `timeAgo` is already written in the user's locale, for example "2 minutes ago". */
  updatedAgo: (timeAgo: string) => `Updated ${timeAgo}`,
  notifyMe: "Tell me when the status changes",
  notificationsOn: "We will tell you when the status changes.",
  notificationsBlocked: "Notifications are blocked in the settings of your browser.",
  backToMenu: "Back to the menu",
};

export type OrderingMessages = typeof DEFAULT_MESSAGES;
