/* NOT PART OF THE INTERVIEW. */
import { render, screen } from "@testing-library/react";
import { createDeferred, flush, makeOrder, setTabHidden, wait } from "../testUtils";
import type { Deferred } from "../testUtils";
import { OrderStatusPage } from "./OrderStatusPage";
import type { FetchOrder, Order } from "./types";
import { POLL_MS } from "./useOrderStatus";

function renderStatusPage() {
  const answers: Deferred<Order>[] = [];
  const fetchOrder: FetchOrder = () => {
    const answer = createDeferred<Order>();
    answers.push(answer);
    return answer.promise;
  };
  render(<OrderStatusPage orderId="1001" fetchOrder={fetchOrder} />);

  async function answerLast(order: Order | Error): Promise<void> {
    const answer = answers[answers.length - 1];
    if (order instanceof Error) {
      answer.reject(order);
    } else {
      answer.resolve(order);
    }
    await flush();
  }
  return { answers, answerLast };
}

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

    expect(screen.getByRole("status")).toHaveTextContent("Loading your order…");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("shows all six steps and marks the current one", async () => {
    const { answerLast } = renderStatusPage();

    await answerLast(makeOrder("preparing", 100));

    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    expect(currentStep()).toHaveLength(1);
    expect(currentStep()[0]).toHaveTextContent("Order preparing");
  });

  it("marks the steps before the current one as done, in words", async () => {
    const { answerLast } = renderStatusPage();

    await answerLast(makeOrder("preparing", 100));

    const texts = screen.getAllByRole("listitem").map((step) => step.textContent);
    expect(texts).toEqual([
      "Order placed (done)",
      "Order accepted (done)",
      "Order preparing",
      "Order picked up",
      "Order arriving",
      "Order delivered",
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
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Order preparing");

    await wait(POLL_MS);
    await answerLast(makeOrder("picked_up", 200));

    // The same element gets the new text, so a screen reader reads it.
    expect(screen.getByRole("status")).toBe(status);
    expect(status).toHaveTextContent("Order picked up");
  });

  it("shows “Reconnecting…” and keeps the last status when the server fails", async () => {
    const { answerLast } = renderStatusPage();
    await answerLast(makeOrder("picked_up", 200));

    await wait(POLL_MS);
    await answerLast(new Error("500"));

    expect(screen.getByText("Reconnecting…")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Order picked up");
    expect(currentStep()[0]).toHaveTextContent("Order picked up");
  });

  it("keeps “Reconnecting…” out of the live region", async () => {
    const { answerLast } = renderStatusPage();
    await answerLast(makeOrder("picked_up", 200));

    await wait(POLL_MS);
    await answerLast(new Error("500"));

    expect(screen.getByRole("status")).not.toHaveTextContent("Reconnecting");
  });

  it("removes “Reconnecting…” after the next good answer", async () => {
    const { answerLast } = renderStatusPage();
    await answerLast(new Error("500"));
    expect(screen.getByText("Reconnecting…")).toBeInTheDocument();

    await wait(2 * POLL_MS);
    await answerLast(makeOrder("accepted", 100));

    expect(screen.queryByText("Reconnecting…")).not.toBeInTheDocument();
  });

  it("never moves the status backwards when an old answer arrives late", async () => {
    const { answerLast } = renderStatusPage();
    await answerLast(makeOrder("picked_up", 300));

    await wait(POLL_MS);
    await answerLast(makeOrder("preparing", 200));

    expect(screen.getByRole("status")).toHaveTextContent("Order picked up");
    expect(currentStep()[0]).toHaveTextContent("Order picked up");
  });

  it("shows “delivered” as the current step, with no arrival time", async () => {
    const { answerLast } = renderStatusPage();

    await answerLast(makeOrder("delivered", 500, 0));

    expect(currentStep()[0]).toHaveTextContent("Order delivered");
    expect(screen.queryByText(/Arriving in/)).not.toBeInTheDocument();
  });

  it("says a cancelled order is cancelled, and marks no step", async () => {
    const { answerLast } = renderStatusPage();

    await answerLast(makeOrder("cancelled", 500));

    expect(screen.getByRole("status")).toHaveTextContent("Order cancelled");
    expect(currentStep()).toHaveLength(0);
    expect(screen.queryByText(/done/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Arriving in/)).not.toBeInTheDocument();
  });
});
