/* NOT PART OF THE INTERVIEW: production version. */
import { makeOrder } from "../testUtils";
import { NEXT_STATUSES, canReach, judgeUpdate } from "./orderMachine";
import { ORDER_STEPS } from "./types";
import type { OrderStatus } from "./types";

const ALL: OrderStatus[] = [...ORDER_STEPS, "cancelled"];

describe("the order state machine", () => {
  it("has a row for every status", () => {
    expect(Object.keys(NEXT_STATUSES).sort()).toEqual([...ALL].sort());
  });

  it("lets every step go to the next step", () => {
    for (let step = 0; step < ORDER_STEPS.length - 1; step++) {
      expect(canReach(ORDER_STEPS[step], ORDER_STEPS[step + 1])).toBe(true);
    }
  });

  it("lets the page miss steps: “placed” can become “arriving”", () => {
    expect(canReach("placed", "arriving")).toBe(true);
    expect(canReach("accepted", "delivered")).toBe(true);
  });

  it("never goes backwards", () => {
    for (let later = 1; later < ORDER_STEPS.length; later++) {
      for (let earlier = 0; earlier < later; earlier++) {
        expect(canReach(ORDER_STEPS[later], ORDER_STEPS[earlier])).toBe(false);
      }
    }
  });

  it("can be cancelled until it is delivered, and not after", () => {
    expect(canReach("placed", "cancelled")).toBe(true);
    expect(canReach("arriving", "cancelled")).toBe(true);
    expect(canReach("delivered", "cancelled")).toBe(false);
  });

  it("goes nowhere from “delivered” and from “cancelled”", () => {
    for (const status of ALL) {
      expect(canReach("delivered", status)).toBe(false);
      expect(canReach("cancelled", status)).toBe(false);
    }
  });
});

describe("judgeUpdate", () => {
  it("accepts the first update", () => {
    expect(judgeUpdate(null, makeOrder("preparing", 100))).toBe("accepted");
  });

  it("calls an update stale when the server made it before the one on screen", () => {
    expect(judgeUpdate(makeOrder("picked_up", 300), makeOrder("preparing", 200))).toBe("stale");
  });

  it("calls a newer update impossible when its status cannot follow", () => {
    const delivered = makeOrder("delivered", 300);

    expect(judgeUpdate(delivered, makeOrder("preparing", 400))).toBe("impossible");
    expect(judgeUpdate(makeOrder("cancelled", 300), makeOrder("accepted", 400))).toBe("impossible");
  });

  it("accepts a newer update with the same status, for example a move of the courier", () => {
    expect(judgeUpdate(makeOrder("picked_up", 300), makeOrder("picked_up", 400))).toBe("accepted");
    expect(judgeUpdate(makeOrder("picked_up", 300), makeOrder("picked_up", 300))).toBe("accepted");
  });

  it("accepts a newer update that jumps over steps", () => {
    expect(judgeUpdate(makeOrder("placed", 100), makeOrder("arriving", 400))).toBe("accepted");
  });
});
