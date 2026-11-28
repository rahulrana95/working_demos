/*
 * NOT PART OF THE INTERVIEW: production version.
 * A fake server for the demo. It answers after a random delay. An order moves
 * to its next status every few seconds, so you can watch the status page.
 * It also has a stream of updates, like server-sent events, and a courier
 * who moves from the restaurant to the home.
 */
import { CartChangedError, ORDER_STEPS } from "../ordering";
import type {
  CartChange,
  FetchMenu,
  FetchOrder,
  MenuCategory,
  Order,
  PlaceOrder,
  Position,
  SubscribeToOrder,
} from "../ordering";
import { createDemoMenu } from "./menuData";

export const RESTAURANT_POSITION: Position = { lat: 12.9716, lng: 77.5946 };
export const HOME_POSITION: Position = { lat: 12.985, lng: 77.61 };

const MIN_DELAY_MS = 150;
const MAX_DELAY_MS = 600;
const SLOW_DELAY_MS = 3000;
/** The fake kitchen is fast: the order moves one step in this time. */
const DEFAULT_STEP_MS = 8000;
const MINUTES_PER_STEP = 6;
/** With "old answers" on, every second answer is this many steps behind. */
const OLD_ANSWER_STEPS_BEHIND = 2;
/** The courier sends a new position this often. */
const POSITION_MS = 2000;
/** The stream looks for something new to send this often. */
const STREAM_TICK_MS = 250;
/** With "old answers" on, the stream sends the step before again, this much later. */
const LATE_EVENT_MS = 700;
const PICKED_UP_STEP = ORDER_STEPS.indexOf("picked_up");
const DELIVERED_STEP = ORDER_STEPS.indexOf("delivered");
const PRICE_RISE_PAISE = 2000;
const DISH_WITH_NEW_PRICE = "paneer-tikka";
const DISH_SOLD_OUT = "samosa";

export interface FakeServerOptions {
  /** Return true to make every request fail and every stream break. */
  shouldFail: () => boolean;
  /** Return true to make every answer take three seconds more. */
  isSlow: () => boolean;
  /** Return true to send old updates: every second answer, and a late event on the stream. */
  sendsOldAnswers: () => boolean;
  /** Return true to break the stream only. Requests still work. */
  isStreamBroken: () => boolean;
  /** Return true to raise one price and sell out one dish, after the menu was sent. */
  hasMenuChanged: () => boolean;
  /** Called once for every request, with a line for the panel. */
  onRequest: (line: string) => void;
  stepMs?: number;
}

export interface FakeServer {
  fetchMenu: FetchMenu;
  placeOrder: PlaceOrder;
  fetchOrder: FetchOrder;
  subscribeToOrder: SubscribeToOrder;
  /** How many orders the server created. Two taps must give one order. */
  countOrders: () => number;
}

interface OrderRecord {
  id: string;
  createdAt: number;
  answersSent: number;
}

const DATABASE_KEY = "fake-server-orders";

function readSavedOrders(): [string, OrderRecord][] {
  try {
    return JSON.parse(sessionStorage.getItem(DATABASE_KEY) ?? "[]") as [string, OrderRecord][];
  } catch {
    return [];
  }
}

function saveOrders(orders: Map<string, OrderRecord>): void {
  try {
    sessionStorage.setItem(DATABASE_KEY, JSON.stringify([...orders]));
  } catch {
    // The demo still works until the page loads again.
  }
}

export function createFakeServer(options: FakeServerOptions): FakeServer {
  const { shouldFail, isSlow, sendsOldAnswers, isStreamBroken, hasMenuChanged, onRequest } =
    options;
  const stepMs = options.stepMs ?? DEFAULT_STEP_MS;
  const menu = createDemoMenu();
  // The "database" of the fake server is saved in sessionStorage. A real
  // server does not forget its orders when the page loads again, for example
  // on the way back from the payment page.
  const ordersByKey = new Map<string, OrderRecord>(readSavedOrders());
  const ordersById = new Map<string, OrderRecord>(
    [...ordersByKey.values()].map((record) => [record.id, record]),
  );

  /** Answers after a delay, fails when the toggle is on, and stops when aborted. */
  function respond<T>(signal: AbortSignal, name: string, answer: () => T): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const delayMs =
        MIN_DELAY_MS +
        Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS) +
        (isSlow() ? SLOW_DELAY_MS : 0);

      const timerId = setTimeout(() => {
        if (shouldFail()) {
          onRequest(`${name} → failed`);
          reject(new Error("The server did not respond"));
          return;
        }
        try {
          resolve(answer());
        } catch (error) {
          reject(error);
        }
      }, delayMs);

      signal.addEventListener("abort", () => {
        clearTimeout(timerId);
        reject(new DOMException("The request was cancelled", "AbortError"));
      });
    });
  }

  /** The menu as the server has it now. It can differ from the menu the page got. */
  function currentMenu(): MenuCategory[] {
    if (!hasMenuChanged()) {
      return menu;
    }
    return menu.map((category) => ({
      ...category,
      items: category.items.map((item) => {
        if (item.id === DISH_WITH_NEW_PRICE) {
          return { ...item, price: item.price + PRICE_RISE_PAISE };
        }
        return item.id === DISH_SOLD_OUT ? { ...item, available: false } : item;
      }),
    }));
  }

  /** The order as it was when it reached the given step, before the courier moved. */
  function orderAtStep(record: OrderRecord, step: number): Order {
    return {
      id: record.id,
      status: ORDER_STEPS[step],
      etaMinutes: (DELIVERED_STEP - step) * MINUTES_PER_STEP,
      updatedAt: record.createdAt + step * stepMs,
    };
  }

  function currentStep(record: OrderRecord): number {
    const stepsPassed = Math.floor((Date.now() - record.createdAt) / stepMs);
    return Math.min(DELIVERED_STEP, stepsPassed);
  }

  /** The order as it is now. From "picked up" on, it has the courier's position. */
  function currentOrder(record: OrderRecord): Order {
    const step = currentStep(record);
    const order = orderAtStep(record, step);
    if (step < PICKED_UP_STEP || step >= DELIVERED_STEP) {
      return order;
    }
    const rideStartedAt = record.createdAt + PICKED_UP_STEP * stepMs;
    const rideMs = (DELIVERED_STEP - PICKED_UP_STEP) * stepMs;
    // The position changes in jumps, as a phone that reports every two seconds.
    const reportedAt =
      rideStartedAt + Math.floor((Date.now() - rideStartedAt) / POSITION_MS) * POSITION_MS;
    const progress = Math.min(1, (reportedAt - rideStartedAt) / rideMs);
    return {
      ...order,
      updatedAt: Math.max(order.updatedAt, reportedAt),
      courier: {
        name: "Ravi",
        lat: RESTAURANT_POSITION.lat + (HOME_POSITION.lat - RESTAURANT_POSITION.lat) * progress,
        lng: RESTAURANT_POSITION.lng + (HOME_POSITION.lng - RESTAURANT_POSITION.lng) * progress,
      },
    };
  }

  return {
    fetchMenu: (restaurantId, signal) =>
      respond(signal, `GET /restaurants/${restaurantId}/menu`, () => {
        onRequest(`GET /restaurants/${restaurantId}/menu → ${menu.length} categories`);
        return currentMenu();
      }),

    placeOrder: (lines, idempotencyKey, signal) =>
      respond(signal, "POST /orders", () => {
        const known = ordersByKey.get(idempotencyKey);
        if (known === undefined) {
          const items = new Map(
            currentMenu().flatMap((category) => category.items.map((item) => [item.id, item])),
          );
          const changes = lines.flatMap((line): CartChange[] => {
            const item = items.get(line.itemId);
            if (item === undefined || !item.available) {
              return [{ itemId: line.itemId, reason: "unavailable" }];
            }
            return item.price === line.unitPrice
              ? []
              : [{ itemId: line.itemId, reason: "price_changed", newPrice: item.price }];
          });
          if (changes.length > 0) {
            onRequest(`POST /orders → refused, ${changes.length} changed (no order created)`);
            throw new CartChangedError(changes);
          }
        }
        const record = known ?? {
          id: String(1001 + ordersByKey.size),
          createdAt: Date.now(),
          answersSent: 0,
        };
        ordersByKey.set(idempotencyKey, record);
        ordersById.set(record.id, record);
        saveOrders(ordersByKey);
        onRequest(
          `POST /orders → order ${record.id} (${known ? "same key, same order" : "created"})`,
        );
        return orderAtStep(record, 0);
      }),

    fetchOrder: (orderId, signal) =>
      respond(signal, `GET /orders/${orderId}`, () => {
        const record = ordersById.get(orderId);
        if (record === undefined) {
          throw new Error(`No order ${orderId}`);
        }
        record.answersSent += 1;
        const step = currentStep(record);
        const isOld = sendsOldAnswers() && record.answersSent % 2 === 0 && step > 0;
        const order = isOld
          ? orderAtStep(record, Math.max(0, step - OLD_ANSWER_STEPS_BEHIND))
          : currentOrder(record);
        onRequest(`GET /orders/${orderId} → ${order.status}${isOld ? " (old answer)" : ""}`);
        return order;
      }),

    subscribeToOrder: (orderId, onUpdate, onError) => {
      const name = `STREAM /orders/${orderId}/events`;
      const record = ordersById.get(orderId);
      let lateTimerId: ReturnType<typeof setTimeout> | undefined;
      // The stream sends only what changes after it opened.
      let lastSentAt = record === undefined ? 0 : currentOrder(record).updatedAt;
      let lastStep = record === undefined ? 0 : currentStep(record);
      onRequest(`${name} → opened`);

      const tickId = setInterval(() => {
        if (record === undefined || shouldFail() || isStreamBroken()) {
          clearInterval(tickId);
          onRequest(`${name} → broke`);
          onError();
          return;
        }
        const order = currentOrder(record);
        if (order.updatedAt === lastSentAt) {
          return;
        }
        lastSentAt = order.updatedAt;
        onUpdate(order);

        const step = currentStep(record);
        if (step !== lastStep) {
          onRequest(`${name} → event: ${order.status}`);
          if (sendsOldAnswers()) {
            const oldOrder = orderAtStep(record, lastStep);
            lateTimerId = setTimeout(() => {
              onRequest(`${name} → event: ${oldOrder.status} (old update, late)`);
              onUpdate(oldOrder);
            }, LATE_EVENT_MS);
          }
          lastStep = step;
        }
      }, STREAM_TICK_MS);

      return () => {
        clearInterval(tickId);
        clearTimeout(lateTimerId);
      };
    },

    countOrders: () => ordersByKey.size,
  };
}
