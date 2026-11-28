/* NOT PART OF THE INTERVIEW: production version. Tests for the fake line of the demo. */
import { CrdtEngine, OtEngine } from "../collab";
import { createCrdtServer } from "./crdtServer";
import { createFakeChannel } from "./fakeChannel";
import { createOtServer } from "./otServer";

describe("fake channel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setup() {
    const server = createCrdtServer();
    const a = new CrdtEngine({ site: "a", name: "A", flushMs: 0 });
    const b = new CrdtEngine({ site: "b", name: "B", flushMs: 0 });
    const channelA = createFakeChannel(server, a);
    const channelB = createFakeChannel(server, b);
    return { server, a, b, channelA, channelB };
  }

  it("carries an edit from one engine to the other", () => {
    const { a, b } = setup();

    a.edit("hi", 2);
    vi.advanceTimersByTime(0);

    expect(b.text()).toBe("hi");
  });

  it("carries the OT engine too", () => {
    const server = createOtServer();
    const a = new OtEngine({ site: "a", name: "A" });
    const b = new OtEngine({ site: "b", name: "B" });
    createFakeChannel(server, a);
    createFakeChannel(server, b);

    a.edit("hi", 2);
    vi.advanceTimersByTime(0);

    expect(b.text()).toBe("hi");
  });

  it("delays messages in both directions", () => {
    const { a, b, channelA } = setup();
    channelA.setDelay(500);

    a.edit("hi", 2);
    vi.advanceTimersByTime(499);
    expect(b.text()).toBe("");
    vi.advanceTimersByTime(1);
    expect(b.text()).toBe("hi");
    expect(a.pendingCount).toBe(1); // The ack is still on its way back.
    vi.advanceTimersByTime(500);

    expect(a.pendingCount).toBe(0);
  });

  it("loses what is on its way when the side goes offline, and catches up when it is back", () => {
    const { server, a, b, channelA } = setup();
    channelA.setDelay(500);
    a.edit("hi", 2);
    vi.advanceTimersByTime(100);

    channelA.setOnline(false);
    vi.advanceTimersByTime(1000);
    expect(server.getLog()).toHaveLength(0);
    expect(a.isOnline).toBe(false);
    channelA.setOnline(true);
    vi.advanceTimersByTime(2000);

    expect(b.text()).toBe("hi");
    expect(a.pendingCount).toBe(0);
  });

  it("does nothing when it is set to the state it already has", () => {
    const { a, channelA } = setup();
    const listener = vi.fn();
    a.subscribe(listener);

    channelA.setOnline(true);

    expect(listener).not.toHaveBeenCalled();
  });

  it("closes the line on dispose", () => {
    const { a, b, channelA } = setup();

    channelA.dispose();
    a.edit("hi", 2);
    vi.advanceTimersByTime(1000);

    expect(a.isOnline).toBe(false);
    expect(b.text()).toBe("");
  });
});
