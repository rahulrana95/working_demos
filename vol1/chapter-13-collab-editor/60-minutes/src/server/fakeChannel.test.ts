/* NOT PART OF THE INTERVIEW. Tests for the fake line of the demo. */
import { CollabSession } from "../collab";
import { createFakeChannel } from "./fakeChannel";
import { createFakeServer } from "./fakeServer";

describe("fake channel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setup() {
    const server = createFakeServer();
    const a = new CollabSession({ site: "a", flushMs: 0 });
    const b = new CollabSession({ site: "b", flushMs: 0 });
    const channelA = createFakeChannel(server, a);
    const channelB = createFakeChannel(server, b);
    return { server, a, b, channelA, channelB };
  }

  it("carries an edit from one session to the other", () => {
    const { a, b, channelA, channelB } = setup();

    a.edit("hi", 2);
    vi.advanceTimersByTime(0);

    expect(b.doc.text()).toBe("hi");
    expect(channelA.getStats()).toEqual({ sent: 1, received: 0 });
    expect(channelB.getStats()).toEqual({ sent: 0, received: 1 });
  });

  it("delays messages in both directions", () => {
    const { a, b, channelA } = setup();
    channelA.setDelay(500);

    a.edit("hi", 2);
    vi.advanceTimersByTime(499);
    expect(b.doc.text()).toBe("");
    expect(a.pendingCount).toBe(1);
    vi.advanceTimersByTime(1);
    expect(b.doc.text()).toBe("hi");
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

    expect(b.doc.text()).toBe("hi");
    expect(a.pendingCount).toBe(0);
  });

  it("does nothing when it is set to the state it already has", () => {
    const { a, channelA } = setup();
    const listener = vi.fn();
    a.subscribe(listener);

    channelA.setOnline(true);

    expect(listener).not.toHaveBeenCalled();
  });

  it("tells its listeners when the numbers change, and stops after dispose", () => {
    const { a, channelA } = setup();
    const listener = vi.fn();
    channelA.subscribe(listener);

    a.edit("hi", 2);
    vi.advanceTimersByTime(0);
    expect(listener).toHaveBeenCalled();
    listener.mockClear();
    channelA.dispose();
    a.edit("hi!", 3);
    vi.advanceTimersByTime(100);

    expect(listener).not.toHaveBeenCalled();
    expect(a.isOnline).toBe(false);
  });
});
