/*
 * NOT PART OF THE INTERVIEW: production version.
 * Two hooks play two tabs. A fake BroadcastChannel carries the messages
 * between them at once.
 */
import { act, renderHook } from "@testing-library/react";
import { NAAN, TIKKA } from "../testUtils";
import { useCart } from "./useCart";

class FakeChannel {
  static open: FakeChannel[] = [];
  static sent: unknown[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;

  constructor(public name: string) {
    FakeChannel.open.push(this);
  }

  postMessage(data: unknown) {
    FakeChannel.sent.push(data);
    for (const other of FakeChannel.open) {
      if (other !== this && other.name === this.name) {
        other.onmessage?.({ data });
      }
    }
  }

  close() {
    FakeChannel.open = FakeChannel.open.filter((channel) => channel !== this);
  }
}

/**
 * Opens a "tab". Real tabs have their own sessionStorage. Here they share
 * one, so the test empties it before a tab opens when the tab must start empty.
 */
function openTab(restaurantId = "r1") {
  return renderHook(() => useCart(restaurantId));
}

const cartMessages = () =>
  FakeChannel.sent.filter((message) => (message as { type: string }).type === "cart");

beforeEach(() => {
  sessionStorage.clear();
  FakeChannel.open = [];
  FakeChannel.sent = [];
  vi.stubGlobal("BroadcastChannel", FakeChannel);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useCart: several tabs", () => {
  it("shows a change of one tab in the other tab", () => {
    const first = openTab();
    const second = openTab();

    act(() => first.result.current[1]({ type: "add", item: TIKKA }));

    expect(second.result.current[0]).toEqual([{ itemId: "tikka", quantity: 1 }]);
  });

  it("works in both directions, and the tabs end with the same cart", () => {
    const first = openTab();
    const second = openTab();

    act(() => first.result.current[1]({ type: "add", item: TIKKA }));
    act(() => second.result.current[1]({ type: "add", item: NAAN }));
    act(() => second.result.current[1]({ type: "remove", itemId: "tikka" }));

    expect(first.result.current[0]).toEqual([{ itemId: "naan", quantity: 1 }]);
    expect(second.result.current[0]).toEqual(first.result.current[0]);
  });

  it("does not send a received cart back, so two tabs do not talk for ever", () => {
    const first = openTab();
    openTab();

    act(() => first.result.current[1]({ type: "add", item: TIKKA }));

    expect(cartMessages()).toHaveLength(1);
  });

  it("gives a new tab the cart of a tab that is already open", () => {
    const first = openTab();
    act(() => first.result.current[1]({ type: "add", item: TIKKA }));
    sessionStorage.clear();

    const second = openTab();

    expect(second.result.current[0]).toEqual([{ itemId: "tikka", quantity: 1 }]);
  });

  it("does not empty the other tabs when a new, empty tab opens", () => {
    const first = openTab();
    act(() => first.result.current[1]({ type: "add", item: TIKKA }));
    sessionStorage.clear();

    openTab();

    expect(first.result.current[0]).toEqual([{ itemId: "tikka", quantity: 1 }]);
  });

  it("empties the other tab when the order was placed and the cart was cleared", () => {
    const first = openTab();
    const second = openTab();
    act(() => first.result.current[1]({ type: "add", item: TIKKA }));

    act(() => first.result.current[1]({ type: "clear" }));

    expect(second.result.current[0]).toEqual([]);
  });

  it("saves a cart that came from another tab in its own storage", () => {
    const first = openTab();
    openTab();
    sessionStorage.clear();

    act(() => first.result.current[1]({ type: "add", item: TIKKA }));

    expect(JSON.parse(sessionStorage.getItem("cart:r1") ?? "null")).toEqual([
      { itemId: "tikka", quantity: 1 },
    ]);
  });

  it("keeps the carts of two restaurants apart", () => {
    const first = openTab("r1");
    const other = openTab("r2");

    act(() => first.result.current[1]({ type: "add", item: TIKKA }));

    expect(other.result.current[0]).toEqual([]);
  });

  it("drops lines from another tab that are not real cart lines", () => {
    const tab = openTab();
    const stranger = new FakeChannel("cart:r1");

    act(() =>
      stranger.postMessage({
        type: "cart",
        lines: [{ itemId: "tikka", quantity: 2 }, { itemId: "naan", quantity: 9999 }, "junk"],
      }),
    );
    act(() => stranger.postMessage({ type: "cart", lines: "not a list" }));
    act(() => stranger.postMessage(null));

    expect(tab.result.current[0]).toEqual([{ itemId: "tikka", quantity: 2 }]);
  });

  it("stops listening when the page is removed", () => {
    const first = openTab();
    const second = openTab();

    second.unmount();
    act(() => first.result.current[1]({ type: "add", item: TIKKA }));

    expect(FakeChannel.open).toHaveLength(1);
  });

  it("works in one tab in a browser without BroadcastChannel", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const tab = openTab();

    act(() => tab.result.current[1]({ type: "add", item: TIKKA }));

    expect(tab.result.current[0]).toEqual([{ itemId: "tikka", quantity: 1 }]);
  });
});
