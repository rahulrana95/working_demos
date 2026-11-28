/* NOT PART OF THE INTERVIEW. Tests for the fake network of the demo. */
import type { Op } from "../collab";
import { createFakeNetwork } from "./fakeNetwork";

function op(counter: number): Op {
  return { type: "insert", id: { site: "a", counter }, after: null, char: "x" };
}

describe("fake network", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setup() {
    const network = createFakeNetwork(["a", "b"]);
    const received: Op[][] = [];
    network.transportFor("b").subscribe((ops) => received.push(ops));
    return { network, received, a: network.transportFor("a") };
  }

  it("delivers to the other site, not to the sender", () => {
    const { network, received, a } = setup();
    const own: Op[][] = [];
    a.subscribe((ops) => own.push(ops));

    a.send([op(1)]);

    expect(received).toEqual([[op(1)]]);
    expect(own).toEqual([]);
    expect(network.getStats()).toEqual({
      sent: { a: 1, b: 0 },
      received: { a: 0, b: 1 },
      inFlight: 0,
    });
  });

  it("delivers after the delay of the sender", () => {
    const { network, received, a } = setup();
    network.setDelay("a", 500);

    a.send([op(1)]);
    vi.advanceTimersByTime(499);
    expect(received).toHaveLength(0);
    expect(network.getStats().inFlight).toBe(1);
    vi.advanceTimersByTime(1);

    expect(received).toHaveLength(1);
  });

  it("keeps the order of a link when the delay becomes shorter", () => {
    const { network, received, a } = setup();
    network.setDelay("a", 500);
    a.send([op(1)]);
    network.setDelay("a", 0);
    a.send([op(2)]);

    vi.advanceTimersByTime(500);

    expect(received).toEqual([[op(1)], [op(2)]]);
  });

  it("holds messages while the receiver or the sender is offline, and delivers them after", () => {
    const { network, received, a } = setup();
    network.setOnline("b", false);
    a.send([op(1)]);
    network.setOnline("a", false);
    a.send([op(2)]);
    network.setOnline("b", true);
    expect(received).toHaveLength(0);

    network.setOnline("a", true);

    expect(received).toEqual([[op(1)], [op(2)]]);
  });

  it("tells its listeners when the numbers change, and stops when asked", () => {
    const { network, a } = setup();
    const listener = vi.fn();
    const stop = network.subscribe(listener);

    a.send([op(1)]);
    expect(listener).toHaveBeenCalled();
    listener.mockClear();
    stop();
    a.send([op(2)]);

    expect(listener).not.toHaveBeenCalled();
  });

  it("delivers nothing after dispose", () => {
    const { network, received, a } = setup();
    network.setDelay("a", 500);
    a.send([op(1)]);

    network.dispose();
    vi.advanceTimersByTime(1000);

    expect(received).toHaveLength(0);
  });
});
