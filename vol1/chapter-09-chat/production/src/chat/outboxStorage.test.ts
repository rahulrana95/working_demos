/* NOT PART OF THE INTERVIEW. Tests of the stored outbox. */
import { loadOutbox, outboxKey, saveOutbox } from "./outboxStorage";
import { createMemoryStore, serverMessage } from "./testUtils";
import type { Message } from "./types";

function waiting(clientId: string, fields: Partial<Message> = {}): Message {
  return {
    clientId,
    conversationId: "c1",
    senderId: "asha",
    text: `text ${clientId}`,
    createdAt: 1000,
    status: "sending",
    ...fields,
  };
}

const KEY = outboxKey("asha", "c1");

describe("outbox storage", () => {
  it("gives back what was stored, in the same order", () => {
    const { store } = createMemoryStore();
    const messages = [waiting("a"), waiting("b", { status: "failed" })];

    saveOutbox(store, "asha", "c1", messages);

    expect(loadOutbox(store, "asha", "c1")).toEqual(messages);
  });

  it("stores only messages that are not confirmed", () => {
    const { store } = createMemoryStore();

    saveOutbox(store, "asha", "c1", [serverMessage("1"), waiting("a")]);

    expect(loadOutbox(store, "asha", "c1").map((message) => message.clientId)).toEqual(["a"]);
  });

  it("does not store a message with an image, and not its progress", () => {
    const { store, items } = createMemoryStore();
    const image = waiting("a", {
      attachment: { url: "blob:x", name: "a.png" },
      uploadProgress: 0.5,
    });

    saveOutbox(store, "asha", "c1", [image, waiting("b")]);

    expect(items.get(KEY)).not.toContain("blob:");
    expect(loadOutbox(store, "asha", "c1").map((message) => message.clientId)).toEqual(["b"]);
  });

  it("removes the key when nothing waits", () => {
    const { store, items } = createMemoryStore();
    saveOutbox(store, "asha", "c1", [waiting("a")]);

    saveOutbox(store, "asha", "c1", [serverMessage("1")]);

    expect(items.has(KEY)).toBe(false);
  });

  it("keeps the messages of two people and of two conversations apart", () => {
    const { store } = createMemoryStore();

    saveOutbox(store, "asha", "c1", [waiting("a")]);

    expect(loadOutbox(store, "ravi", "c1")).toEqual([]);
    expect(loadOutbox(store, "asha", "c2")).toEqual([]);
  });

  it.each([
    ["text that is not JSON", "{{{"],
    ["a value that is not a list", '{"clientId":"a"}'],
    ["null", "null"],
  ])("gives an empty list for %s", (_name, stored) => {
    const { store } = createMemoryStore({ [KEY]: stored });

    expect(loadOutbox(store, "asha", "c1")).toEqual([]);
  });

  it("drops stored entries that are not a waiting message of this person and conversation", () => {
    const entries = [
      waiting("good"),
      null,
      "text",
      { clientId: "no-text" },
      waiting("", {}),
      waiting("other-person", { senderId: "ravi" }),
      waiting("other-conversation", { conversationId: "c2" }),
      waiting("confirmed", { status: "sent" }),
      waiting("too-long", { text: "a".repeat(2001) }),
      waiting("bad-time", { createdAt: Number.NaN }),
    ];
    const { store } = createMemoryStore({ [KEY]: JSON.stringify(entries) });

    expect(loadOutbox(store, "asha", "c1").map((message) => message.clientId)).toEqual(["good"]);
  });

  it("takes only the fields it knows from a stored entry", () => {
    const tampered = {
      ...waiting("a"),
      id: "99",
      attachment: { url: "javascript:alert(1)", name: "x" },
    };
    const { store } = createMemoryStore({ [KEY]: JSON.stringify([tampered]) });

    expect(loadOutbox(store, "asha", "c1")).toEqual([waiting("a")]);
  });

  it("holds at most 100 messages", () => {
    const { store } = createMemoryStore();
    const many = Array.from({ length: 150 }, (_, index) => waiting(`m${index}`));

    saveOutbox(store, "asha", "c1", many);

    const loaded = loadOutbox(store, "asha", "c1");
    expect(loaded).toHaveLength(100);
    expect(loaded[99].clientId).toBe("m149");
  });

  it("does not throw when storage is full or switched off", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };

    expect(() => saveOutbox(broken, "asha", "c1", [waiting("a")])).not.toThrow();
    expect(() => saveOutbox(broken, "asha", "c1", [])).not.toThrow();
    expect(loadOutbox(broken, "asha", "c1")).toEqual([]);
  });
});
