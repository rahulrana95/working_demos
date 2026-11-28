/* NOT PART OF THE INTERVIEW. Tests of the state of the conversation list. */
import { conversationsReducer, NO_CONVERSATIONS } from "./conversationsReducer";
import type { ConversationsAction, ConversationsState } from "./conversationsReducer";
import { conversation, serverMessage } from "./testUtils";

function run(actions: ConversationsAction[], start: ConversationsState = NO_CONVERSATIONS) {
  return actions.reduce(conversationsReducer, start);
}

const last = (createdAt: number, text = "hello") => ({ senderId: "ravi", text, createdAt });
const loaded: ConversationsAction = {
  type: "loaded",
  conversations: [
    conversation("a", { lastMessage: last(1000) }),
    conversation("b", { lastMessage: last(3000), unreadCount: 2 }),
    conversation("c"),
  ],
};
const incoming = (
  conversationId: string,
  id: string,
  countsAsUnread = true,
): ConversationsAction => ({
  type: "message",
  message: serverMessage(id, { conversationId }),
  countsAsUnread,
});

describe("conversationsReducer", () => {
  it("stores every conversation once, under its id, with the newest message first in the order", () => {
    const state = run([loaded]);

    expect(Object.keys(state.byId).sort()).toEqual(["a", "b", "c"]);
    expect(state.order).toEqual(["b", "a", "c"]);
    expect(state.byId.b.unreadCount).toBe(2);
  });

  it("moves a conversation to the top, shows its new message and counts it as unread", () => {
    const state = run([loaded, incoming("a", "5")]);

    expect(state.order).toEqual(["a", "b", "c"]);
    expect(state.byId.a.lastMessage).toMatchObject({ text: "text 5", createdAt: 5000 });
    expect(state.byId.a.unreadCount).toBe(1);
  });

  it("does not count a message the user is looking at, or one of their own", () => {
    const state = run([loaded, incoming("a", "5", false)]);

    expect(state.byId.a.unreadCount).toBe(0);
    expect(state.byId.a.lastMessage?.text).toBe("text 5");
  });

  it("counts a message once when the server pushes it twice", () => {
    const state = run([loaded, incoming("a", "5"), incoming("a", "5")]);

    expect(state.byId.a.unreadCount).toBe(1);
  });

  it("ignores a late message that is older than the last one it knows", () => {
    const state = run([loaded, incoming("b", "2")]);

    expect(state.byId.b.lastMessage?.createdAt).toBe(3000);
    expect(state.byId.b.unreadCount).toBe(2);
  });

  it("ignores a message of a conversation it does not know", () => {
    const state = run([loaded]);

    expect(run([incoming("unknown", "9")], state)).toBe(state);
  });

  it("sets the count to zero when the user opens the conversation", () => {
    const state = run([loaded, { type: "opened", conversationId: "b" }]);

    expect(state.byId.b.unreadCount).toBe(0);
    expect(state.byId.a.unreadCount).toBe(0);
  });

  it("gives the same state back when nothing is unread, so nothing is drawn again", () => {
    const state = run([loaded]);

    expect(run([{ type: "opened", conversationId: "a" }], state)).toBe(state);
    expect(run([{ type: "opened", conversationId: "unknown" }], state)).toBe(state);
  });

  it("keeps a newer message that was pushed while the list was loading", () => {
    const state = run([loaded, incoming("a", "9"), loaded]);

    expect(state.byId.a.lastMessage?.createdAt).toBe(9000);
    expect(state.byId.a.unreadCount).toBe(1);
    expect(state.order[0]).toBe("a");
  });

  it("takes the counts of the server when its answer is as new as what it knows", () => {
    const state = run([loaded, { type: "opened", conversationId: "b" }, loaded]);

    expect(state.byId.b.unreadCount).toBe(2);
  });

  it("drops a conversation that the server does not list any more", () => {
    const state = run([loaded, { type: "loaded", conversations: [conversation("a")] }]);

    expect(state.order).toEqual(["a"]);
  });

  it("keeps the order steady for two conversations with the same time", () => {
    const same = [
      conversation("z", { lastMessage: last(1000) }),
      conversation("y", { lastMessage: last(1000) }),
    ];

    expect(run([{ type: "loaded", conversations: same }]).order).toEqual(["y", "z"]);
  });

  it("shows the image of the last message in the summary", () => {
    const message = serverMessage("5", {
      conversationId: "a",
      text: "",
      attachment: { url: "https://x/a.png", name: "a.png" },
    });
    const state = run([loaded, { type: "message", message, countsAsUnread: true }]);

    expect(state.byId.a.lastMessage?.attachment?.name).toBe("a.png");
  });
});
