/*
 * NOT PART OF THE INTERVIEW.
 * These tests prove the ids have the right shape and do not repeat.
 */
import { uuid } from "./uuid";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uuid", () => {
  it("uses crypto.randomUUID where it exists", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "from-the-browser" });

    expect(uuid()).toBe("from-the-browser");
  });

  it("makes a version 4 UUID without crypto.randomUUID", () => {
    vi.stubGlobal("crypto", {});

    for (let run = 0; run < 1000; run += 1) {
      expect(uuid()).toMatch(UUID);
    }
  });

  it("makes a version 4 UUID where there is no crypto at all", () => {
    vi.stubGlobal("crypto", undefined);

    expect(uuid()).toMatch(UUID);
  });

  it("does not repeat in 10,000 ids, with and without crypto.randomUUID", () => {
    const withCrypto = new Set(Array.from({ length: 10_000 }, uuid));
    vi.stubGlobal("crypto", {});
    const withoutCrypto = new Set(Array.from({ length: 10_000 }, uuid));

    expect(withCrypto.size).toBe(10_000);
    expect(withoutCrypto.size).toBe(10_000);
  });
});
