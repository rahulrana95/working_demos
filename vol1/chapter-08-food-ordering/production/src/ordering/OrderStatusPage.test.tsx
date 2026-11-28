/* NOT PART OF THE INTERVIEW: production version. */
import { act, render, screen } from "@testing-library/react";
import { createDeferred, flush, makeOrder, setTabHidden, wait } from "../testUtils";
import type { Deferred } from "../testUtils";
import { DEFAULT_MESSAGES } from "./messages";
import { OrderStatusPage } from "./OrderStatusPage";
import type { OrderStatusPageProps } from "./OrderStatusPage";
import type { FetchOrder, Order, SubscribeToOrder } from "./types";
import { POLL_MS } from "./useOrderStatus";

const HOME = { lat: 12.985, lng: 77.61 };
/** About 1.2 km south of the home. */
const COURIER = { name: "Ravi", lat: 12.9742, lng: 77.61 };

function renderStatusPage(extra: Partial<OrderStatusPageProps> = {}, withStream = false) {
  const answers: Deferred<Order>[] = [];
  const fetchOrder: FetchOrder = () => {
    const answer = createDeferred<Order>();
    answers.push(answer);
    return answer.promise;
  };
  let sendOnStream: (order: Order) => void = () => {};
  const subscribeToOrder: SubscribeToOrder = (_orderId, onUpdate) => {
    sendOnStream = onUpdate;
    return () => {};
  };
  const view = render(
    <OrderStatusPage
      orderId="1001"
      fetchOrder={fetchOrder}
      subscribeToOrder={withStream ? subscribeToOrder : undefined}
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
  return { ...view, answers, answerLast, send: (order: Order) => sendOnStream(order) };
}

/** The live region with the status. The page has other live regions too. */
const statusLine = () => document.querySelector(".order__status") as HTMLElement;

const currentStep = () =>
  screen.getAllByRole("listitem").filter((step) => step.getAttribute("aria-current") === "step");

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(async () => {
  await setTabHidden(false);
  vi.useRealTimers();
});

describe("OrderStatusPage", () => {
  it("says “loading” before the first answer", () => {
    renderStatusPage();

    expect(screen.getByText("Loading your order…")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("shows all six steps and marks the current one", async () => {
    const { answerLast } = renderStatusPage();

    await answerLast(makeOrder("preparing", 100));

    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    expect(currentStep()).toHaveLength(1);
    expect(currentStep()[0]).toHaveTextContent("Food is being prepared");
  });

  it("marks the steps before the current one as done, in words", async () => {
    const { answerLast } = renderStatusPage();

    await answerLast(makeOrder("preparing", 100));

    const texts = screen.getAllByRole("listitem").map((step) => step.textContent);
    expect(texts).toEqual([
      "Order placed (done)",
      "Restaurant accepted the order (done)",
      "Food is being prepared",
      "Courier picked up the food",
      "Courier is nearby",
      "Delivered",
    ]);
  });

  it("shows the arrival time as text", async () => {
    const { answerLast } = renderStatusPage();

    await answerLast(makeOrder("preparing", 100, 25));

    expect(screen.getByText("Arriving in about 25 minutes")).toBeInTheDocument();
  });

  it("announces a new status in a polite live region", async () => {
    const { answerLast } = renderStatusPage();
    await answerLast(makeOrder("preparing", 100));
    const status = statusLine();
    expect(status).toHaveTextContent("Food is being prepared");

    await wait(POLL_MS);
    await answerLast(makeOrder("picked_up", 200));

    // The same element gets the new text, so a screen reader reads it.
    expect(statusLine()).toBe(status);
    expect(status).toHaveTextContent("Courier picked up the food");
  });

  it("shows “Reconnecting…” and keeps the last status when the server fails", async () => {
    const { answerLast } = renderStatusPage();
    await answerLast(makeOrder("picked_up", 200));

    await wait(POLL_MS);
    await answerLast(new Error("500"));

    expect(screen.getByText(/Reconnecting…/)).toBeInTheDocument();
    expect(statusLine()).toHaveTextContent("Courier picked up the food");
    expect(currentStep()[0]).toHaveTextContent("Courier picked up the food");
  });

  it("keeps “Reconnecting…” out of the live region", async () => {
    const { answerLast } = renderStatusPage();
    await answerLast(makeOrder("picked_up", 200));

    await wait(POLL_MS);
    await answerLast(new Error("500"));

    expect(statusLine()).not.toHaveTextContent("Reconnecting");
  });

  it("removes “Reconnecting…” after the next good answer", async () => {
    const { answerLast } = renderStatusPage();
    await answerLast(new Error("500"));
    expect(screen.getByText(/Reconnecting…/)).toBeInTheDocument();

    await wait(2 * POLL_MS);
    await answerLast(makeOrder("accepted", 100));

    expect(screen.queryByText(/Reconnecting…/)).not.toBeInTheDocument();
  });

  it("never moves the status backwards when an old answer arrives late", async () => {
    const { answerLast } = renderStatusPage();
    await answerLast(makeOrder("picked_up", 300));

    await wait(POLL_MS);
    await answerLast(makeOrder("preparing", 200));

    expect(statusLine()).toHaveTextContent("Courier picked up the food");
    expect(currentStep()[0]).toHaveTextContent("Courier picked up the food");
  });

  it("shows “Delivered” as the current step, with no arrival time", async () => {
    const { answerLast } = renderStatusPage();

    await answerLast(makeOrder("delivered", 500, 0));

    expect(currentStep()[0]).toHaveTextContent("Delivered");
    expect(screen.queryByText(/Arriving in/)).not.toBeInTheDocument();
  });

  it("says a cancelled order is cancelled, and marks no step", async () => {
    const { answerLast } = renderStatusPage();

    await answerLast(makeOrder("cancelled", 500));

    expect(statusLine()).toHaveTextContent("Order cancelled");
    expect(currentStep()).toHaveLength(0);
    expect(screen.queryByText(/done/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Arriving in/)).not.toBeInTheDocument();
  });
});

describe("OrderStatusPage: the stream", () => {
  it("shows an update of the stream without a new request", async () => {
    const { answers, answerLast, send } = renderStatusPage({}, true);
    await answerLast(makeOrder("preparing", 100));

    await act(async () => send(makeOrder("picked_up", 200)));
    await wait(10 * POLL_MS);

    expect(statusLine()).toHaveTextContent("Courier picked up the food");
    expect(answers).toHaveLength(1);
  });
});

describe("OrderStatusPage: the courier", () => {
  const onTheWay: Order = { ...makeOrder("picked_up", 300, 12), courier: COURIER };

  it("says in text how far the courier is", async () => {
    const { answerLast } = renderStatusPage({ destination: HOME });

    await answerLast(onTheWay);

    expect(screen.getByText("Ravi is about 1.2 km away")).toBeInTheDocument();
  });

  it("draws the map as a picture that screen readers skip", async () => {
    const { answerLast, container } = renderStatusPage({ destination: HOME });

    await answerLast(onTheWay);

    const picture = container.querySelector("svg");
    expect(picture).toHaveAttribute("aria-hidden", "true");
    expect(picture?.querySelector("circle")).not.toBeNull();
    expect(picture?.querySelector("rect")).not.toBeNull();
  });

  it("keeps the distance out of the live region, so it is not read on every move", async () => {
    const { answerLast } = renderStatusPage({ destination: HOME });

    await answerLast(onTheWay);

    expect(statusLine()).not.toHaveTextContent("km");
    expect(screen.getByText(/km away/).closest("[aria-live], [role=status]")).toBeNull();
    expect(screen.getByText(/km away/).tagName).toBe("FIGCAPTION");
  });

  it("updates the text when the courier moves", async () => {
    const { answerLast } = renderStatusPage({ destination: HOME });
    await answerLast(onTheWay);

    await wait(POLL_MS);
    // About 0.5 km south of the home now.
    await answerLast({ ...onTheWay, updatedAt: 400, courier: { ...COURIER, lat: 12.9805 } });

    expect(screen.getByText("Ravi is about 0.5 km away")).toBeInTheDocument();
  });

  it("draws no map before the courier has the food, or without a destination", async () => {
    const withHome = renderStatusPage({ destination: HOME });
    await withHome.answerLast(makeOrder("preparing", 100));
    expect(withHome.container.querySelector("svg")).toBeNull();
    withHome.unmount();

    const withoutHome = renderStatusPage();
    await withoutHome.answerLast(onTheWay);
    expect(withoutHome.container.querySelector("svg")).toBeNull();
  });

  it("removes the map when the order is delivered", async () => {
    const { answerLast, container } = renderStatusPage({ destination: HOME });
    await answerLast(onTheWay);

    await wait(POLL_MS);
    await answerLast({ ...makeOrder("delivered", 500, 0), courier: COURIER });

    expect(container.querySelector("svg")).toBeNull();
  });
});

describe("OrderStatusPage: texts and language", () => {
  it("has no fixed English: every text can be replaced", async () => {
    const mark = (key: string, value: unknown): unknown => {
      if (typeof value === "function") {
        return () => `[${key}]`;
      }
      return typeof value === "string"
        ? `[${key}]`
        : Object.fromEntries(Object.keys(value as object).map((inner) => [inner, `[${key}]`]));
    };
    const marked = Object.fromEntries(
      Object.entries(DEFAULT_MESSAGES).map(([key, value]) => [key, mark(key, value)]),
    ) as OrderStatusPageProps["messages"];
    const { answerLast, container } = renderStatusPage({ destination: HOME, messages: marked });
    expect(container.textContent?.replace(/\[\w+\]/g, "")).toBe("");

    await answerLast({ ...makeOrder("picked_up", 300), courier: COURIER });
    await wait(POLL_MS);
    await answerLast(new Error("500"));

    expect(container.textContent?.replace(/\[\w+\]/g, "").trim()).toBe("");
    expect(container.textContent).toContain("[reconnecting]");
    expect(container.textContent).toContain("[courierDistance]");
  });

  it("writes the distance with the numbers of the locale", async () => {
    const { answerLast } = renderStatusPage({ destination: HOME, locale: "de-DE" });

    await answerLast({ ...makeOrder("picked_up", 300), courier: COURIER });

    expect(screen.getByText("Ravi is about 1,2 km away")).toBeInTheDocument();
  });

  it("uses the texts the app gives, and the default for the others", async () => {
    const { answerLast } = renderStatusPage({
      messages: { orderHeading: "आपका ऑर्डर", eta: (minutes) => `${minutes} मिनट` },
    });

    await answerLast(makeOrder("preparing", 100, 25));

    expect(screen.getByRole("heading", { name: "आपका ऑर्डर" })).toBeInTheDocument();
    expect(screen.getByText("25 मिनट")).toBeInTheDocument();
    expect(statusLine()).toHaveTextContent("Food is being prepared");
  });
});
