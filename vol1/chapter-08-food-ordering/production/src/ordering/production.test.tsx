/*
 * NOT PART OF THE INTERVIEW: production version.
 * Tests for what the first week adds to the two pages: the saved menu, the
 * offline hint, skeletons, the age of the status, notifications, the error
 * boundary of the map, the way back from the payment, and the events.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MENU, createDeferred, flush, makeOrder, setTabHidden, wait } from "../testUtils";
import type { Deferred } from "../testUtils";
import type { OrderingEvent } from "./events";
import { clearMenuMemory, writeCachedMenu } from "./menuCache";
import { OrderingFlow } from "./OrderingFlow";
import type { OrderingFlowProps } from "./OrderingFlow";
import { OrderStatusPage } from "./OrderStatusPage";
import type { OrderStatusPageProps } from "./OrderStatusPage";
import { readPendingOrder, savePendingOrder } from "./pendingOrder";
import { RestaurantPage } from "./RestaurantPage";
import type { RestaurantPageProps } from "./RestaurantPage";
import type { MenuCategory, Order } from "./types";
import { MENU_TIMEOUT_MS } from "./useMenu";
import { POLL_MS } from "./useOrderStatus";
import { TOAST_MS } from "./useStatusNotifications";

const HOME = { lat: 12.985, lng: 77.61 };
const COURIER = { name: "Ravi", lat: 12.9742, lng: 77.61 };
const button = (name: string) => screen.getByRole("button", { name });
const statusLine = () => document.querySelector(".order__status") as HTMLElement;

function setOnline(isOnline: boolean): void {
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => isOnline });
  act(() => void window.dispatchEvent(new Event(isOnline ? "online" : "offline")));
}

/** A fake of the browser's Notification, with a permission the test sets. */
function stubNotification(permission: NotificationPermission, answer: NotificationPermission) {
  const shown: string[] = [];
  const requestPermission = vi.fn(async () => {
    FakeNotification.permission = answer;
    return answer;
  });
  class FakeNotification {
    static permission = permission;
    static requestPermission = requestPermission;
    constructor(title: string) {
      shown.push(title);
    }
  }
  vi.stubGlobal("Notification", FakeNotification);
  return { shown, requestPermission };
}

function renderRestaurant(extra: Partial<RestaurantPageProps> = {}) {
  const menu = createDeferred<MenuCategory[]>();
  const fetchMenu = vi.fn().mockReturnValue(menu.promise);
  const events: OrderingEvent[] = [];
  const props: RestaurantPageProps = {
    restaurantId: "r1",
    fetchMenu,
    placeOrder: vi.fn().mockReturnValue(new Promise(() => {})),
    onOrderPlaced: vi.fn(),
    onEvent: (event) => events.push(event),
    ...extra,
  };
  const view = render(<RestaurantPage {...props} />);
  return { ...view, menu, fetchMenu, events };
}

function renderStatus(extra: Partial<OrderStatusPageProps> = {}) {
  const answers: Deferred<Order>[] = [];
  const events: OrderingEvent[] = [];
  const fetchOrder = vi.fn(() => {
    const answer = createDeferred<Order>();
    answers.push(answer);
    return answer.promise;
  });
  const view = render(
    <OrderStatusPage
      orderId="1001"
      fetchOrder={fetchOrder}
      onEvent={(event) => events.push(event)}
      {...extra}
    />,
  );
  async function answerLast(order: Order | Error): Promise<void> {
    const answer = answers[answers.length - 1];
    if (order instanceof Error) {
      answer.reject(order);
    } else {
      answer.resolve(order);
    }
    await flush();
  }
  return { ...view, answers, answerLast, fetchOrder, events };
}

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  localStorage.clear();
  clearMenuMemory();
});

afterEach(async () => {
  setOnline(true);
  await setTabHidden(false);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("the menu: saved copy, slow network and offline", () => {
  it("shows a skeleton with a text for screen readers while the first menu loads", () => {
    const { container } = renderRestaurant();

    expect(screen.getByText("Loading the menu…")).toHaveClass("visually-hidden");
    expect(container.querySelectorAll(".skeleton__row").length).toBeGreaterThan(0);
    expect(container.querySelector(".skeleton [aria-hidden=true]")).not.toBeNull();
  });

  it("shows the saved menu at once, and still asks the server for a fresh one", () => {
    writeCachedMenu("r1", MENU);

    const { fetchMenu } = renderRestaurant();

    expect(button("Add Paneer Tikka")).toBeInTheDocument();
    expect(screen.getByText(/menu we saved earlier/)).toBeInTheDocument();
    expect(fetchMenu).toHaveBeenCalledTimes(1);
  });

  it("replaces the saved menu with the fresh one, and saves the fresh one", async () => {
    writeCachedMenu("r1", MENU);
    const { menu } = renderRestaurant();
    const fresh = [{ ...MENU[0], items: [{ ...MENU[0].items[0], price: 25000 }] }];

    await act(async () => menu.resolve(fresh));

    expect(screen.getByText("Veg · ₹250.00")).toBeInTheDocument();
    expect(screen.queryByText(/menu we saved earlier/)).not.toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem("menu:r1") ?? "null")).toEqual(fresh);
  });

  it("keeps the saved menu, with its note, when the fresh one cannot be loaded", async () => {
    writeCachedMenu("r1", MENU);
    const { menu } = renderRestaurant();

    await act(async () => menu.reject(new Error("offline")));

    expect(button("Add Paneer Tikka")).toBeInTheDocument();
    expect(screen.getByText(/menu we saved earlier/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("never saves a failure: the next visit asks the server again", async () => {
    const first = renderRestaurant();
    await act(async () => first.menu.reject(new Error("500")));
    expect(screen.getByRole("alert")).toHaveTextContent("We could not load the menu.");
    first.unmount();

    const second = renderRestaurant();

    expect(second.fetchMenu).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("menu:r1")).toBeNull();
  });

  it("shows the error after 10 seconds without an answer, and aborts the request", async () => {
    const { fetchMenu } = renderRestaurant();

    await wait(MENU_TIMEOUT_MS);

    expect(screen.getByRole("alert")).toHaveTextContent("We could not load the menu.");
    expect((fetchMenu.mock.calls[0][1] as AbortSignal).aborted).toBe(true);
  });

  it("says “offline” as a hint, and sends the request all the same", async () => {
    setOnline(false);

    const { fetchMenu, menu } = renderRestaurant();
    expect(screen.getByText("You seem to be offline. We keep trying.")).toBeInTheDocument();
    expect(fetchMenu).toHaveBeenCalledTimes(1);

    // The hint was wrong: the network works, and the menu is shown.
    await act(async () => menu.resolve(MENU));
    expect(button("Add Paneer Tikka")).toBeInTheDocument();
  });

  it("removes the offline hint when the browser is online again", () => {
    setOnline(false);
    renderRestaurant();

    setOnline(true);

    expect(screen.queryByText(/You seem to be offline/)).not.toBeInTheDocument();
  });
});

describe("the menu: events", () => {
  it("reports the menu once, with the number of dishes and where it came from", async () => {
    const { menu, events } = renderRestaurant();
    await wait(120);

    await act(async () => menu.resolve(MENU));
    fireEvent.click(button("Add Paneer Tikka"));

    const viewed = events.filter((event) => event.type === "menu_viewed");
    expect(viewed).toHaveLength(1);
    expect(viewed[0]).toMatchObject({ dishCount: 3, fromCache: false });
  });

  it("reports a saved menu as “from cache”, and not again when the fresh one arrives", async () => {
    writeCachedMenu("r1", MENU);
    const { menu, events } = renderRestaurant();

    await act(async () => menu.resolve(MENU));

    expect(events.filter((event) => event.type === "menu_viewed")).toEqual([
      { type: "menu_viewed", dishCount: 3, durationMs: expect.any(Number), fromCache: true },
    ]);
  });

  it("reports every added dish with the new size of the cart", async () => {
    const { menu, events } = renderRestaurant();
    await act(async () => menu.resolve(MENU));

    fireEvent.click(button("Add Paneer Tikka"));
    fireEvent.click(button("Add Butter Naan"));
    fireEvent.click(button("Remove one Butter Naan"));
    fireEvent.click(button("Add Biryani"));

    expect(events.filter((event) => event.type === "item_added")).toEqual([
      { type: "item_added", cartCount: 1 },
      { type: "item_added", cartCount: 2 },
    ]);
  });
});

describe("the status page: age, offline and loading", () => {
  it("shows a skeleton with a text for screen readers before the first answer", () => {
    const { container } = renderStatus();

    expect(screen.getByText("Loading your order…")).toHaveClass("visually-hidden");
    expect(container.querySelector(".skeleton")).not.toBeNull();
  });

  it("says how old the status is while it reconnects", async () => {
    const { answerLast } = renderStatus();
    await answerLast(makeOrder("preparing", 100));

    await wait(POLL_MS);
    await answerLast(new Error("500"));
    expect(screen.getByText(/Reconnecting…/)).toHaveTextContent("Updated less than a minute ago");

    await wait(2 * 60_000 + 15_000);
    expect(screen.getByText(/Reconnecting…/)).toHaveTextContent("Updated 2 minutes ago");
    expect(statusLine()).toHaveTextContent("Food is being prepared");
  });

  it("writes the age in the language of the locale", async () => {
    const { answerLast } = renderStatus({ locale: "hi-IN" });
    await answerLast(makeOrder("preparing", 100));
    await wait(POLL_MS);
    await answerLast(new Error("500"));

    await wait(3 * 60_000 + 15_000);

    expect(screen.getByText(/Reconnecting…/)).toHaveTextContent("3 मिनट पहले");
  });

  it("says “offline” and how old the status is, and keeps the last status", async () => {
    const { answerLast } = renderStatus();
    await answerLast(makeOrder("picked_up", 100));

    setOnline(false);

    expect(screen.getByText("You seem to be offline. We keep trying.")).toBeInTheDocument();
    expect(screen.getByText("Updated less than a minute ago")).toBeInTheDocument();
    expect(statusLine()).toHaveTextContent("Courier picked up the food");
  });

  it("asks the server at once when the browser is back online", async () => {
    const { answerLast, fetchOrder } = renderStatus();
    await answerLast(new Error("offline"));
    setOnline(false);
    const callsBefore = fetchOrder.mock.calls.length;

    setOnline(true);

    expect(fetchOrder.mock.calls.length).toBe(callsBefore + 1);
  });

  it("tells the parent once when the order is finished", async () => {
    const onOrderFinished = vi.fn();
    const { answerLast } = renderStatus({ onOrderFinished });
    await answerLast(makeOrder("arriving", 100));
    expect(onOrderFinished).not.toHaveBeenCalled();

    await wait(POLL_MS);
    await answerLast(makeOrder("delivered", 200));

    expect(onOrderFinished).toHaveBeenCalledTimes(1);
  });
});

describe("the status page: a new status", () => {
  it("shows a short message for a new status in a visible tab, and removes it", async () => {
    const { answerLast, container } = renderStatus();
    await answerLast(makeOrder("preparing", 100));
    expect(container.querySelector(".toast")).toBeNull();

    await wait(POLL_MS);
    await answerLast(makeOrder("picked_up", 200));
    expect(container.querySelector(".toast")).toHaveTextContent("Courier picked up the food");

    await wait(TOAST_MS);
    expect(container.querySelector(".toast")).toBeNull();
  });

  it("hides the short message from screen readers, because the live region already said it", async () => {
    const { answerLast, container } = renderStatus();
    await answerLast(makeOrder("preparing", 100));
    await wait(POLL_MS);
    await answerLast(makeOrder("picked_up", 200));

    expect(container.querySelector(".toast")).toHaveAttribute("aria-hidden", "true");
    expect(statusLine()).toHaveTextContent("Courier picked up the food");
  });

  it("never asks for the permission by itself", async () => {
    const { requestPermission } = stubNotification("default", "granted");
    const { answerLast } = renderStatus();

    await answerLast(makeOrder("preparing", 100));
    await wait(POLL_MS);
    await answerLast(makeOrder("picked_up", 200));

    expect(requestPermission).not.toHaveBeenCalled();
    expect(button("Tell me when the status changes")).toBeInTheDocument();
  });

  it("asks for the permission when the user taps the button", async () => {
    const { requestPermission } = stubNotification("default", "granted");
    const { answerLast } = renderStatus();
    await answerLast(makeOrder("preparing", 100));

    await act(async () => fireEvent.click(button("Tell me when the status changes")));

    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(screen.getByText("We will tell you when the status changes.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Tell me/ })).not.toBeInTheDocument();
  });

  it("says so when the user blocked notifications, and does not ask again", async () => {
    const { requestPermission } = stubNotification("denied", "denied");
    const { answerLast } = renderStatus();

    await answerLast(makeOrder("preparing", 100));

    expect(screen.getByText(/Notifications are blocked/)).toBeInTheDocument();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("shows a notification of the browser for a new status in a hidden tab", async () => {
    const { shown } = stubNotification("granted", "granted");
    const { answerLast, container } = renderStatus();
    await answerLast(makeOrder("preparing", 100));

    await setTabHidden(true);
    // The user allowed notifications, so the page still polls in the hidden tab.
    await wait(POLL_MS);
    await answerLast(makeOrder("picked_up", 200));

    expect(shown).toEqual(["Courier picked up the food"]);
    expect(container.querySelector(".toast")).toBeNull();
  });

  it("shows no notification in a hidden tab without the permission, and none in a visible tab", async () => {
    const { shown } = stubNotification("granted", "granted");
    const { answerLast } = renderStatus();
    await answerLast(makeOrder("preparing", 100));

    await wait(POLL_MS);
    await answerLast(makeOrder("picked_up", 200));

    expect(shown).toEqual([]);
  });

  it("offers no button in a browser without notifications", async () => {
    vi.stubGlobal("Notification", undefined);
    const { answerLast } = renderStatus();

    await answerLast(makeOrder("preparing", 100));

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("the status page: the map breaks", () => {
  const onTheWay: Order = { ...makeOrder("picked_up", 300, 12), courier: COURIER };

  it("keeps the status, the steps and the distance when the map throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { answerLast, events } = renderStatus({ destination: HOME });

    // A position that is not on the earth makes the map throw.
    await answerLast({ ...onTheWay, courier: { ...COURIER, lat: 999 } });

    expect(screen.getByText("The map is not available.")).toBeInTheDocument();
    expect(statusLine()).toHaveTextContent("Courier picked up the food");
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    expect(screen.getByText(/km away/)).toBeInTheDocument();
    expect(events).toContainEqual({ type: "map_failed" });
  });

  it("draws the map for a good position", async () => {
    const { answerLast, container } = renderStatus({ destination: HOME });

    await answerLast(onTheWay);

    expect(container.querySelector("svg circle")).not.toBeNull();
    expect(screen.queryByText("The map is not available.")).not.toBeInTheDocument();
  });
});

describe("the flow: paying on an outside page and coming back", () => {
  const PLACED = makeOrder("placed", 100);

  function renderFlow(extra: Partial<OrderingFlowProps> = {}) {
    const fetchOrder = vi.fn().mockResolvedValue(makeOrder("accepted", 200));
    const props: OrderingFlowProps = {
      restaurantId: "r1",
      fetchMenu: vi.fn().mockResolvedValue(MENU),
      placeOrder: vi.fn().mockResolvedValue(PLACED),
      fetchOrder,
      ...extra,
    };
    return { ...render(<OrderingFlow {...props} />), fetchOrder, props };
  }

  async function placeOrder(): Promise<void> {
    await flush();
    fireEvent.click(button("Add Paneer Tikka"));
    await act(async () => fireEvent.click(button("Place order")));
  }

  it("shows the menu when no order is pending", async () => {
    renderFlow();
    await flush();

    expect(button("Add Paneer Tikka")).toBeInTheDocument();
  });

  it("saves the id of the order before it sends the user to the payment page", async () => {
    const savedWhenLeaving: (string | null)[] = [];
    const startPayment = vi.fn(() => savedWhenLeaving.push(readPendingOrder()));
    renderFlow({ startPayment });

    await placeOrder();

    expect(startPayment).toHaveBeenCalledWith(PLACED);
    expect(savedWhenLeaving).toEqual(["1001"]);
  });

  it("finds the order after the app was loaded again, and shows its status", async () => {
    const leaving = renderFlow({ startPayment: vi.fn() });
    await placeOrder();
    // The browser goes to the payment page: the app and its memory are gone.
    leaving.unmount();
    clearMenuMemory();

    const back = renderFlow();
    await flush();

    expect(back.fetchOrder).toHaveBeenCalledWith("1001", expect.any(AbortSignal));
    expect(statusLine()).toHaveTextContent("Restaurant accepted the order");
    expect(back.props.fetchMenu).not.toHaveBeenCalled();
  });

  it("shows the status page at once when there is no payment step", async () => {
    const { fetchOrder } = renderFlow();

    await placeOrder();
    await flush();

    expect(fetchOrder).toHaveBeenCalledWith("1001", expect.any(AbortSignal));
    expect(screen.getByRole("heading", { name: "Your order" })).toBeInTheDocument();
  });

  it("moves the focus to the new page, not to a button that is gone", async () => {
    const { container } = renderFlow();
    await flush();
    fireEvent.click(button("Add Paneer Tikka"));
    button("Place order").focus();

    await act(async () => fireEvent.click(button("Place order")));

    expect(document.activeElement).toBe(container.querySelector(".ordering-flow"));
  });

  it("forgets the order when it is finished, so the next start shows the menu", async () => {
    savePendingOrder("1001");
    renderFlow({ fetchOrder: vi.fn().mockResolvedValue(makeOrder("delivered", 500)) });

    await flush();

    expect(statusLine()).toHaveTextContent("Delivered");
    expect(readPendingOrder()).toBeNull();
  });

  it("goes back to the menu and forgets the order when the user asks", async () => {
    savePendingOrder("1001");
    renderFlow();
    await flush();

    fireEvent.click(button("Back to the menu"));
    await flush();

    expect(readPendingOrder()).toBeNull();
    expect(button("Add Paneer Tikka")).toBeInTheDocument();
  });

  it("ignores a pending order that is a day old", async () => {
    savePendingOrder("1001");
    await wait(24 * 60 * 60 * 1000);

    renderFlow();
    await flush();

    expect(button("Add Paneer Tikka")).toBeInTheDocument();
  });
});

describe("events hold no personal data", () => {
  it("never puts a name, a position, an id or a typed text in an event", async () => {
    const events: OrderingEvent[] = [];
    const secretMenu: MenuCategory[] = [
      {
        id: "SECRET-CATEGORY",
        name: "SECRET-CATEGORY-NAME",
        items: [{ ...MENU[0].items[0], id: "SECRET-DISH-ID", name: "SECRET-DISH-NAME" }],
      },
    ];
    const order: Order = {
      id: "SECRET-ORDER-ID",
      status: "picked_up",
      etaMinutes: 12,
      updatedAt: 300,
      courier: { name: "SECRET-COURIER", lat: 12.3456789, lng: 77.6543219 },
    };
    render(
      <OrderingFlow
        restaurantId="SECRET-RESTAURANT"
        fetchMenu={vi.fn().mockResolvedValue(secretMenu)}
        placeOrder={vi
          .fn()
          .mockRejectedValueOnce(new Error("SECRET-ERROR"))
          .mockResolvedValue({ ...order, status: "placed", courier: undefined })}
        fetchOrder={vi.fn().mockResolvedValue(order)}
        destination={{ lat: 12.9876543, lng: 77.1234567 }}
        onEvent={(event) => events.push(event)}
      />,
    );
    await flush();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "SECRET-SEARCH" } });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    await wait(300);
    fireEvent.click(button("Add SECRET-DISH-NAME"));
    await act(async () => fireEvent.click(button("Place order")));
    await act(async () => fireEvent.click(button("Place order")));
    await flush();

    const types = new Set(events.map((event) => event.type));
    expect(types).toEqual(
      new Set([
        "menu_viewed",
        "item_added",
        "checkout_started",
        "order_failed",
        "order_placed",
        "status_changed",
      ]),
    );
    const everything = JSON.stringify(events);
    expect(everything).not.toMatch(/SECRET/);
    expect(everything).not.toMatch(/12\\.3456789|77\\.6543219|12\\.9876543|77\\.1234567/);
    // Every value in an event is a number, a boolean, null, or one of a few fixed words.
    const words = events.flatMap((event) =>
      Object.values(event).filter((value) => typeof value === "string"),
    );
    const allowed = [...types, "failed", "placed", "picked_up", "request"];
    expect(words.every((word) => allowed.includes(word))).toBe(true);
  });
});
