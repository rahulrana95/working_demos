/*
 * NOT PART OF THE INTERVIEW.
 * A fake server for the demo. It answers after a random delay. An order moves
 * to its next status every few seconds, so you can watch the status page.
 */
import { ORDER_STEPS } from "../ordering";
import type { FetchMenu, FetchOrder, MenuCategory, Order, PlaceOrder } from "../ordering";

const rupees = (amount: number) => amount * 100;

export const DEMO_MENU: MenuCategory[] = [
  {
    id: "starters",
    name: "Starters",
    items: [
      {
        id: "paneer-tikka",
        name: "Paneer Tikka",
        description: "Grilled cottage cheese with mint chutney.",
        price: rupees(220),
        isVeg: true,
        available: true,
      },
      {
        id: "chicken-65",
        name: "Chicken 65",
        description: "Fried chicken with curry leaves. Spicy.",
        price: rupees(260),
        isVeg: false,
        available: true,
      },
      {
        id: "samosa",
        name: "Samosa (2 pieces)",
        description: "Potato and peas in a crisp shell.",
        price: 4550,
        isVeg: true,
        available: true,
      },
    ],
  },
  {
    id: "mains",
    name: "Main course",
    items: [
      {
        id: "dal-makhani",
        name: "Dal Makhani",
        description: "Black lentils cooked slowly with butter.",
        price: rupees(240),
        isVeg: true,
        available: true,
      },
      {
        id: "butter-chicken",
        name: "Butter Chicken",
        description: "Chicken in a mild tomato and butter sauce.",
        price: rupees(320),
        isVeg: false,
        available: true,
      },
      {
        id: "veg-biryani",
        name: "Vegetable Biryani",
        description: "Rice with vegetables and whole spices. Served with raita.",
        price: rupees(280),
        isVeg: true,
        available: false,
      },
    ],
  },
  {
    id: "breads",
    name: "Breads",
    items: [
      {
        id: "butter-naan",
        name: "Butter Naan",
        description: "Soft bread from the clay oven.",
        price: rupees(60),
        isVeg: true,
        available: true,
      },
      {
        id: "roti",
        name: "Tandoori Roti",
        description: "Whole wheat bread from the clay oven.",
        price: rupees(35),
        isVeg: true,
        available: true,
      },
    ],
  },
  {
    id: "drinks",
    name: "Drinks",
    items: [
      {
        id: "lassi",
        name: "Sweet Lassi",
        description: "A cold yoghurt drink.",
        price: rupees(90),
        isVeg: true,
        available: true,
      },
      {
        id: "masala-chai",
        name: "Masala Chai",
        description: "Tea with milk and spices.",
        price: rupees(40),
        isVeg: true,
        available: true,
      },
    ],
  },
];

const MIN_DELAY_MS = 150;
const MAX_DELAY_MS = 600;
const SLOW_DELAY_MS = 3000;
/** The fake kitchen is fast: the order moves one step in this time. */
const DEFAULT_STEP_MS = 8000;
const MINUTES_PER_STEP = 6;
/** With "old answers" on, every second answer is this many steps behind. */
const OLD_ANSWER_STEPS_BEHIND = 2;

export interface FakeServerOptions {
  /** Return true to make the next request fail. */
  shouldFail: () => boolean;
  /** Return true to make every answer take three seconds more. */
  isSlow: () => boolean;
  /** Return true to make every second answer for an order an old one. */
  sendsOldAnswers: () => boolean;
  /** Called once for every request, with a line for the panel. */
  onRequest: (line: string) => void;
  stepMs?: number;
}

export interface FakeServer {
  fetchMenu: FetchMenu;
  placeOrder: PlaceOrder;
  fetchOrder: FetchOrder;
  /** How many orders the server created. Two taps must give one order. */
  countOrders: () => number;
}

interface OrderRecord {
  id: string;
  createdAt: number;
  answersSent: number;
}

export function createFakeServer(options: FakeServerOptions): FakeServer {
  const { shouldFail, isSlow, sendsOldAnswers, onRequest, stepMs = DEFAULT_STEP_MS } = options;
  const ordersByKey = new Map<string, OrderRecord>();
  const ordersById = new Map<string, OrderRecord>();

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
        } else {
          resolve(answer());
        }
      }, delayMs);

      signal.addEventListener("abort", () => {
        clearTimeout(timerId);
        reject(new DOMException("The request was cancelled", "AbortError"));
      });
    });
  }

  /** The order as it was when it reached the given step. */
  function orderAtStep(record: OrderRecord, step: number): Order {
    return {
      id: record.id,
      status: ORDER_STEPS[step],
      etaMinutes: (ORDER_STEPS.length - 1 - step) * MINUTES_PER_STEP,
      updatedAt: record.createdAt + step * stepMs,
    };
  }

  function currentStep(record: OrderRecord): number {
    const stepsPassed = Math.floor((Date.now() - record.createdAt) / stepMs);
    return Math.min(ORDER_STEPS.length - 1, stepsPassed);
  }

  return {
    fetchMenu: (restaurantId, signal) =>
      respond(signal, `GET /restaurants/${restaurantId}/menu`, () => {
        onRequest(`GET /restaurants/${restaurantId}/menu → ${DEMO_MENU.length} categories`);
        return DEMO_MENU;
      }),

    placeOrder: (cart, idempotencyKey, signal) =>
      respond(signal, "POST /orders", () => {
        const known = ordersByKey.get(idempotencyKey);
        const record = known ?? {
          id: String(1001 + ordersByKey.size),
          createdAt: Date.now(),
          answersSent: 0,
        };
        ordersByKey.set(idempotencyKey, record);
        ordersById.set(record.id, record);
        onRequest(
          `POST /orders ${JSON.stringify(cart)} → order ${record.id} ` +
            `(${known ? "same key, same order" : "created"})`,
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
        const order = orderAtStep(
          record,
          isOld ? Math.max(0, step - OLD_ANSWER_STEPS_BEHIND) : step,
        );
        onRequest(`GET /orders/${orderId} → ${order.status}${isOld ? " (old answer)" : ""}`);
        return order;
      }),

    countOrders: () => ordersByKey.size,
  };
}
