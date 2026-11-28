/*
 * NOT PART OF THE INTERVIEW.
 * In the interview you say these cases aloud. Here they are written as tests.
 */
import { messagesReducer } from "./messagesReducer";
import type { MessagesAction } from "./messagesReducer";
import { serverMessage } from "./testUtils";
import type { Message } from "./types";

function sending(clientId: string, createdAt = 0): Message {
  return {
    clientId,
    conversationId: "c1",
    senderId: "asha",
    text: `text ${clientId}`,
    createdAt,
    status: "sending",
  };
}

function run(actions: MessagesAction[], start: Message[] = []): Message[] {
  return actions.reduce(messagesReducer, start);
}

const ids = (messages: Message[]) => messages.map((message) => message.id ?? message.clientId);

describe("messagesReducer", () => {
  it("shows a new message at once, at the bottom, as sending", () => {
    const state = run([
      { type: "received", messages: [serverMessage("1")] },
      { type: "added", message: sending("a") },
    ]);

    expect(ids(state)).toEqual(["1", "a"]);
    expect(state[1].status).toBe("sending");
    expect(state[1].id).toBeUndefined();
  });

  it("puts the server id and the status sent on the same entry when the server answers", () => {
    const state = run([
      { type: "added", message: sending("a") },
      { type: "received", messages: [serverMessage("7", { clientId: "a", senderId: "asha" })] },
    ]);

    expect(state).toHaveLength(1);
    expect(state[0]).toMatchObject({ id: "7", clientId: "a", status: "sent" });
  });

  it("shows a message once when the server answers and then pushes the same message", () => {
    const confirmed = serverMessage("7", { clientId: "a", senderId: "asha" });
    const state = run([
      { type: "added", message: sending("a") },
      { type: "received", messages: [confirmed] },
      { type: "received", messages: [{ ...confirmed }] },
    ]);

    expect(ids(state)).toEqual(["7"]);
  });

  it("shows a message once when the pushed copy arrives before the answer", () => {
    const confirmed = serverMessage("7", { clientId: "a", senderId: "asha" });
    const state = run([
      { type: "added", message: sending("a") },
      { type: "received", messages: [{ ...confirmed }] },
      { type: "received", messages: [confirmed] },
    ]);

    expect(ids(state)).toEqual(["7"]);
    expect(state[0].status).toBe("sent");
  });

  it("shows an incoming message once when the server pushes it twice", () => {
    const state = run([
      { type: "received", messages: [serverMessage("3")] },
      { type: "received", messages: [serverMessage("3")] },
    ]);

    expect(ids(state)).toEqual(["3"]);
  });

  it("orders confirmed messages by server time, not by the order they arrived in", () => {
    const state = run([
      { type: "received", messages: [serverMessage("5")] },
      { type: "received", messages: [serverMessage("2")] },
      { type: "received", messages: [serverMessage("4")] },
    ]);

    expect(ids(state)).toEqual(["2", "4", "5"]);
  });

  it("orders two messages of the same millisecond by id", () => {
    const state = run([
      { type: "received", messages: [serverMessage("9", { createdAt: 500 })] },
      { type: "received", messages: [serverMessage("8", { createdAt: 500 })] },
    ]);

    expect(ids(state)).toEqual(["8", "9"]);
  });

  it("uses the server time of a confirmed message, also when our own clock is five minutes behind", () => {
    const fiveMinutesBehind = 10_000 - 5 * 60_000;
    const state = run([
      { type: "received", messages: [serverMessage("1", { createdAt: 9_000 })] },
      { type: "added", message: sending("a", fiveMinutesBehind) },
      { type: "received", messages: [serverMessage("2", { clientId: "a", createdAt: 10_000 })] },
    ]);

    expect(ids(state)).toEqual(["1", "2"]);
    expect(state[1].createdAt).toBe(10_000);
  });

  it("keeps a sending message at the bottom when a confirmed message arrives after it", () => {
    const state = run([
      { type: "added", message: sending("a", 99_000) },
      { type: "received", messages: [serverMessage("3")] },
    ]);

    expect(ids(state)).toEqual(["3", "a"]);
  });

  it("keeps messages that are not confirmed in the order the user wrote them", () => {
    const state = run([
      { type: "added", message: sending("a", 300) },
      { type: "added", message: sending("b", 200) },
      { type: "added", message: sending("c", 100) },
      { type: "failed", clientId: "b" },
      { type: "received", messages: [serverMessage("1")] },
    ]);

    expect(ids(state)).toEqual(["1", "a", "b", "c"]);
  });

  it("marks a sending message as failed", () => {
    const state = run([
      { type: "added", message: sending("a") },
      { type: "failed", clientId: "a" },
    ]);

    expect(state[0].status).toBe("failed");
  });

  it("does not mark a confirmed message as failed when a late error arrives", () => {
    const state = run([
      { type: "added", message: sending("a") },
      { type: "received", messages: [serverMessage("7", { clientId: "a" })] },
      { type: "failed", clientId: "a" },
    ]);

    expect(state[0]).toMatchObject({ id: "7", status: "sent" });
  });

  it("confirms a failed message when the server did store it and pushes its copy", () => {
    const state = run([
      { type: "added", message: sending("a") },
      { type: "failed", clientId: "a" },
      { type: "received", messages: [serverMessage("7", { clientId: "a" })] },
    ]);

    expect(state).toHaveLength(1);
    expect(state[0]).toMatchObject({ id: "7", status: "sent" });
  });

  it("sets a failed message back to sending for a retry, with the same clientId", () => {
    const state = run([
      { type: "added", message: sending("a") },
      { type: "failed", clientId: "a" },
      { type: "retried", clientId: "a" },
    ]);

    expect(state).toHaveLength(1);
    expect(state[0]).toMatchObject({ clientId: "a", status: "sending" });
  });

  it("does not retry a message that has not failed", () => {
    const start = run([{ type: "received", messages: [serverMessage("1")] }]);

    expect(run([{ type: "retried", clientId: "client-1" }], start)[0].status).toBe("sent");
  });

  it("adds an older page above, and shows a message of two pages once", () => {
    const state = run([
      { type: "received", messages: [serverMessage("5"), serverMessage("6")] },
      { type: "received", messages: [serverMessage("3"), serverMessage("4"), serverMessage("5")] },
    ]);

    expect(ids(state)).toEqual(["3", "4", "5", "6"]);
  });

  it("empties the list on reset", () => {
    const start = run([{ type: "received", messages: [serverMessage("1")] }]);

    expect(run([{ type: "reset" }], start)).toEqual([]);
  });

  it("returns a new list and leaves the old one as it was", () => {
    const start = run([{ type: "added", message: sending("a") }]);
    const copy = structuredClone(start);

    const next = run([{ type: "failed", clientId: "a" }], start);

    expect(next).not.toBe(start);
    expect(start).toEqual(copy);
  });

  it("keeps 5,000 messages in server order when they arrive in the wrong order", () => {
    const newestFirst = Array.from({ length: 5000 }, (_, index) =>
      serverMessage(String(5000 - index)),
    );
    const state = run([
      { type: "added", message: sending("a") },
      { type: "received", messages: newestFirst.slice(0, 2500) },
      { type: "received", messages: newestFirst.slice(2400) },
    ]);

    expect(state).toHaveLength(5001);
    expect(state[0].id).toBe("1");
    expect(state[4999].id).toBe("5000");
    expect(state[5000].clientId).toBe("a");
    expect(
      state.slice(0, 5000).every((m, i) => i === 0 || state[i - 1].createdAt < m.createdAt),
    ).toBe(true);
  });
});
