/* NOT PART OF THE INTERVIEW: production version. It only makes imports shorter. */
export { OrderingFlow } from "./OrderingFlow";
export type { OrderingFlowProps } from "./OrderingFlow";
export { RestaurantPage } from "./RestaurantPage";
export type { RestaurantPageProps } from "./RestaurantPage";
export { OrderStatusPage } from "./OrderStatusPage";
export type { OrderStatusPageProps } from "./OrderStatusPage";
export { useOrderStatus } from "./useOrderStatus";
export type { OrderStatusOptions, OrderStatusState } from "./useOrderStatus";
export { cartReducer, cartTotals, createPriceFormatter } from "./cart";
export { CartChangedError } from "./cartChanges";
export type { CartChange } from "./cartChanges";
export type { OnOrderingEvent, OrderingEvent } from "./events";
export { clearMenuMemory } from "./menuCache";
export { DEFAULT_MESSAGES } from "./messages";
export type { OrderingMessages } from "./messages";
export { NEXT_STATUSES, canReach, judgeUpdate } from "./orderMachine";
export { clearPendingOrder, readPendingOrder, savePendingOrder } from "./pendingOrder";
export { ORDER_STEPS } from "./types";
export type {
  CartLine,
  FetchMenu,
  FetchOrder,
  MenuCategory,
  MenuItem,
  Order,
  OrderLine,
  OrderStatus,
  PlaceOrder,
  Position,
  SubscribeToOrder,
} from "./types";
