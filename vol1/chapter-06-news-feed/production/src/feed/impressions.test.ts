/*
 * NOT PART OF THE INTERVIEW: production version.
 * Impressions, with a fake IntersectionObserver and a fake clock.
 */
import { ImpressionTracker } from "./impressions";
import { FakeIntersectionObserver } from "./testHelpers";

function createRow(postId: string): HTMLElement {
  const row = document.createElement("article");
  row.dataset.postId = postId;
  return row;
}

/** Reports to the tracker how much of a row is on screen. */
function show(row: HTMLElement, ratio: number) {
  const [observer] = FakeIntersectionObserver.live;
  observer.triggerFor(row, ratio);
}

function setTabHidden(isHidden: boolean) {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue(isHidden ? "hidden" : "visible");
  document.dispatchEvent(new Event("visibilitychange"));
}

let onBatch: ReturnType<typeof vi.fn>;
let tracker: ImpressionTracker;

beforeEach(() => {
  vi.useFakeTimers();
  FakeIntersectionObserver.install();
  onBatch = vi.fn();
  tracker = new ImpressionTracker(onBatch);
});

afterEach(() => {
  tracker.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ImpressionTracker", () => {
  it("watches with one observer that reports at half of a post", () => {
    tracker.observe(createRow("p1"));
    tracker.observe(createRow("p2"));

    expect(FakeIntersectionObserver.instances).toHaveLength(1);
    expect(FakeIntersectionObserver.instances[0].options.threshold).toBe(0.5);
  });

  it("counts a post that was half on screen for one second", () => {
    const row = createRow("p1");
    tracker.observe(row);

    show(row, 0.5);
    vi.advanceTimersByTime(1000);
    tracker.flush();

    expect(onBatch).toHaveBeenCalledWith(["p1"]);
  });

  it("does not count a post that left the screen before the second was over", () => {
    const row = createRow("p1");
    tracker.observe(row);

    show(row, 0.8);
    vi.advanceTimersByTime(999);
    show(row, 0.2);
    vi.advanceTimersByTime(5000);
    tracker.flush();

    expect(onBatch).not.toHaveBeenCalled();
  });

  it("does not count a post that is less than half on screen", () => {
    const row = createRow("p1");
    tracker.observe(row);

    show(row, 0.49);
    vi.advanceTimersByTime(5000);
    tracker.flush();

    expect(onBatch).not.toHaveBeenCalled();
  });

  it("starts the second again when a post comes back on screen", () => {
    const row = createRow("p1");
    tracker.observe(row);

    show(row, 1);
    vi.advanceTimersByTime(600);
    show(row, 0);
    show(row, 1);
    vi.advanceTimersByTime(600);
    tracker.flush();
    expect(onBatch).not.toHaveBeenCalled();

    vi.advanceTimersByTime(400);
    tracker.flush();
    expect(onBatch).toHaveBeenCalledWith(["p1"]);
  });

  it("sends the ids in one batch after five seconds, not one event per post", () => {
    const rows = [createRow("p1"), createRow("p2"), createRow("p3")];
    rows.forEach((row) => tracker.observe(row));

    rows.forEach((row) => show(row, 1));
    vi.advanceTimersByTime(1000);
    expect(onBatch).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5000);
    expect(onBatch).toHaveBeenCalledTimes(1);
    expect(onBatch).toHaveBeenCalledWith(["p1", "p2", "p3"]);
  });

  it("sends a batch at once when it holds 20 ids", () => {
    const rows = Array.from({ length: 25 }, (_, index) => createRow(`p${index + 1}`));
    rows.forEach((row) => tracker.observe(row));

    rows.forEach((row) => show(row, 1));
    vi.advanceTimersByTime(1000);

    expect(onBatch).toHaveBeenCalledTimes(1);
    expect(onBatch.mock.calls[0][0]).toHaveLength(20);

    vi.advanceTimersByTime(5000);
    expect(onBatch.mock.calls[1][0]).toHaveLength(5);
  });

  it("reports a post once, however often the user scrolls past it", () => {
    const row = createRow("p1");
    tracker.observe(row);

    for (let pass = 0; pass < 3; pass++) {
      show(row, 1);
      vi.advanceTimersByTime(1000);
      show(row, 0);
    }
    vi.advanceTimersByTime(5000);

    expect(onBatch).toHaveBeenCalledTimes(1);
    expect(onBatch).toHaveBeenCalledWith(["p1"]);
  });

  it("does not count a post that is removed from the DOM before the second was over", () => {
    const row = createRow("p1");
    const stopObserving = tracker.observe(row);

    show(row, 1);
    stopObserving();
    vi.advanceTimersByTime(6000);

    expect(onBatch).not.toHaveBeenCalled();
    expect(FakeIntersectionObserver.instances[0].elements.size).toBe(0);
  });

  it("does not count the time in a hidden tab, and starts the second again when the tab is shown", () => {
    const row = createRow("p1");
    tracker.observe(row);
    show(row, 1);
    vi.advanceTimersByTime(600);

    setTabHidden(true);
    vi.advanceTimersByTime(10_000);
    expect(onBatch).not.toHaveBeenCalled();

    setTabHidden(false);
    vi.advanceTimersByTime(999);
    tracker.flush();
    expect(onBatch).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    tracker.flush();
    expect(onBatch).toHaveBeenCalledWith(["p1"]);
  });

  it("sends the ids that wait when the tab is hidden, because it may never come back", () => {
    const row = createRow("p1");
    tracker.observe(row);
    show(row, 1);
    vi.advanceTimersByTime(1000);

    setTabHidden(true);

    expect(onBatch).toHaveBeenCalledWith(["p1"]);
  });

  it("sends the ids that wait and stops watching when the feed is removed", () => {
    const row = createRow("p1");
    tracker.observe(row);
    show(row, 1);
    vi.advanceTimersByTime(1000);

    tracker.stop();

    expect(onBatch).toHaveBeenCalledWith(["p1"]);
    expect(FakeIntersectionObserver.live).toHaveLength(0);
  });

  it("sends nothing when there is nothing to send", () => {
    tracker.flush();
    tracker.stop();

    expect(onBatch).not.toHaveBeenCalled();
  });

  it("uses the times and the batch size that the page passes", () => {
    tracker.stop();
    tracker = new ImpressionTracker(onBatch, { visibleMs: 200, batchMs: 300, maxBatchSize: 2 });
    const row = createRow("p1");
    tracker.observe(row);

    FakeIntersectionObserver.live[0].triggerFor(row, 1);
    vi.advanceTimersByTime(200 + 300);

    expect(onBatch).toHaveBeenCalledWith(["p1"]);
  });

  it("reports nothing, and does not break, in a browser without IntersectionObserver", () => {
    tracker.stop();
    vi.stubGlobal("IntersectionObserver", undefined);
    tracker = new ImpressionTracker(onBatch);

    const stopObserving = tracker.observe(createRow("p1"));
    vi.advanceTimersByTime(10_000);
    stopObserving();

    expect(onBatch).not.toHaveBeenCalled();
  });
});
