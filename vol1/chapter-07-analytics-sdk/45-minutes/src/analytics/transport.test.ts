/*
 * NOT PART OF THE INTERVIEW.
 * These tests prove how the default transport reads the answer of the
 * collector, and how a batch is handed over when the page goes away.
 */
import { removeFakeBeacon } from "./testHelpers";
import { fetchTransport, sendOnExit } from "./transport";

function stubFetch(status: number, headers: Record<string, string> = {}) {
  const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status, headers })));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const signal = new AbortController().signal;

afterEach(() => {
  vi.unstubAllGlobals();
  removeFakeBeacon();
});

describe("fetchTransport", () => {
  it("posts the body as a string, with no custom header and no cookies, so no preflight is needed", async () => {
    const fetchMock = stubFetch(200);

    await fetchTransport("https://collector.test/v1/batch", '{"events":[]}', signal);

    expect(fetchMock).toHaveBeenCalledWith("https://collector.test/v1/batch", {
      method: "POST",
      body: '{"events":[]}',
      signal,
      credentials: "omit",
    });
  });

  it.each([200, 202, 204])("says ok for status %i", async (status) => {
    stubFetch(status);

    await expect(fetchTransport("/collect", "{}", signal)).resolves.toEqual({ kind: "ok" });
  });

  it.each([500, 502, 503, 504, 408, 429])("says retry for status %i", async (status) => {
    stubFetch(status);

    await expect(fetchTransport("/collect", "{}", signal)).resolves.toEqual({ kind: "retry" });
  });

  it.each([400, 401, 403, 404, 413, 422])("says drop for status %i", async (status) => {
    stubFetch(status);

    await expect(fetchTransport("/collect", "{}", signal)).resolves.toEqual({ kind: "drop" });
  });

  it("rejects on a network error, which the SDK counts as retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );

    await expect(fetchTransport("/collect", "{}", signal)).rejects.toThrow("Failed to fetch");
  });
});

describe("sendOnExit", () => {
  it("gives the body to sendBeacon and returns its answer", () => {
    const sendBeacon = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
    Object.defineProperty(navigator, "sendBeacon", { value: sendBeacon, configurable: true });

    expect(sendOnExit("/collect", "first")).toBe(true);
    expect(sendOnExit("/collect", "second")).toBe(false);
    expect(sendBeacon).toHaveBeenNthCalledWith(1, "/collect", "first");
  });

  it("returns false, and does not throw, when sendBeacon throws or fetch does not exist", () => {
    Object.defineProperty(navigator, "sendBeacon", {
      value: () => {
        throw new Error("beacon broke");
      },
      configurable: true,
    });
    expect(sendOnExit("/collect", "body")).toBe(false);

    removeFakeBeacon();
    vi.stubGlobal("fetch", undefined);
    expect(sendOnExit("/collect", "body")).toBe(false);
  });

  it("uses fetch with keepalive where sendBeacon does not exist, and hides its failure", async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error("page is gone")));
    vi.stubGlobal("fetch", fetchMock);

    expect(sendOnExit("/collect", "body")).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/collect", {
      method: "POST",
      body: "body",
      keepalive: true,
      credentials: "omit",
    });
    // Give the rejected promise time to be handled. An unhandled one fails the test run.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
