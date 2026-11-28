/*
 * NOT PART OF THE INTERVIEW.
 * Tests of the list. jsdom does no layout, so the tests give the list a
 * height: every child is 50px tall and the list shows 200px of them.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { MessageList } from "./MessageList";
import { defaultMessages } from "./messages";
import type { ChatMessages } from "./messages";
import { serverMessage } from "./testUtils";
import type { ChatState } from "./useChat";
import type { Message } from "./types";

const ROW_PX = 50;
const VIEW_PX = 200;
const scrollTops = new WeakMap<Element, number>();

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => VIEW_PX,
  });
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return this.children.length * ROW_PX;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "scrollTop", {
    configurable: true,
    get(this: HTMLElement) {
      return scrollTops.get(this) ?? 0;
    },
    set(this: HTMLElement, value: number) {
      scrollTops.set(this, value);
    },
  });
});

function chatState(messages: Message[], overrides: Partial<ChatState> = {}): ChatState {
  return {
    messages,
    loadStatus: "ready",
    hasOlder: true,
    isOpen: true,
    loadOlder: vi.fn(),
    send: vi.fn(() => true),
    retry: vi.fn(),
    ...overrides,
  };
}

const mine = (id: string, fields: Partial<Message> = {}) =>
  serverMessage(id, { senderId: "asha", ...fields });
const many = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => serverMessage(String(from + index)));

function renderList(chat: ChatState, text: ChatMessages = defaultMessages, locale = "en-US") {
  const list = (state: ChatState) => (
    <MessageList chat={state} currentUserId="asha" peerName="Ravi" text={text} locale={locale} />
  );
  const view = render(list(chat));
  const log = screen.getByRole("log");
  const update = (next: ChatState) => view.rerender(list(next));
  /** Moves the list as a user does: the browser then sends a scroll event. */
  const scrollTo = (top: number) => {
    log.scrollTop = top;
    fireEvent.scroll(log);
  };
  return { log, update, scrollTo };
}

describe("MessageList: rows", () => {
  it("is a log that reads new rows politely, has a name and can take the focus", () => {
    const { log } = renderList(chatState([]));

    expect(log).toHaveAttribute("aria-live", "polite");
    expect(log).toHaveAttribute("aria-relevant", "additions");
    expect(log).toHaveAccessibleName("Ravi");
    expect(log).toHaveAttribute("tabindex", "0");
  });

  it("writes who, when and the status of my message as text", () => {
    const at = new Date(2026, 0, 5, 9, 7).getTime();
    renderList(
      chatState([
        mine("1", { status: "sending", createdAt: at }),
        mine("2", { createdAt: at }),
        mine("3", { status: "delivered", createdAt: at }),
        mine("4", { status: "read", createdAt: at }),
        mine("5", { status: "failed", createdAt: at }),
      ]),
    );

    expect(screen.getByText("You · 9:07 AM · Sending…")).toBeInTheDocument();
    expect(screen.getByText("You · 9:07 AM · Sent")).toBeInTheDocument();
    expect(screen.getByText("You · 9:07 AM · Delivered")).toBeInTheDocument();
    expect(screen.getByText("You · 9:07 AM · Read")).toBeInTheDocument();
    expect(screen.getByText("You · 9:07 AM · Not sent")).toBeInTheDocument();
  });

  it("writes the name of the other person and no status on their message", () => {
    const at = new Date(2026, 0, 5, 21, 30).getTime();
    renderList(chatState([serverMessage("1", { createdAt: at })]));

    expect(screen.getByText("Ravi · 9:30 PM")).toBeInTheDocument();
  });

  it("writes the time in the way of the locale", () => {
    const at = new Date(2026, 0, 5, 21, 30).getTime();
    renderList(chatState([serverMessage("1", { createdAt: at })]), defaultMessages, "de-DE");

    expect(screen.getByText("Ravi · 21:30")).toBeInTheDocument();
  });

  it("takes every text from `text`: no English is fixed in the list", () => {
    const text = Object.fromEntries(
      Object.keys(defaultMessages).map((key, index) => [key, `#${index}#`]),
    ) as ChatMessages;
    const { update, scrollTo } = renderList(
      chatState([...many(1, 20), mine("21", { status: "failed" })], {
        loadStatus: "error",
        isOpen: false,
      }),
      text,
    );
    const expectNoEnglish = () => {
      const shown = document.body.textContent ?? "";
      for (const english of Object.values(defaultMessages)) {
        expect(shown).not.toContain(english);
      }
    };
    expectNoEnglish();
    expect(screen.getByRole("button", { name: text.retry })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(text.loadFailed);

    scrollTo(300);
    update(chatState([...many(1, 22)], { loadStatus: "loading", isOpen: false }));

    expectNoEnglish();
    expect(screen.getByRole("button", { name: text.loading })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: text.newMessages })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(text.connecting);
  });

  it("says that it is connecting in a status line, and says nothing while the connection is open", () => {
    const { update } = renderList(chatState(many(1, 3)));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    update(chatState(many(1, 3), { isOpen: false }));

    expect(screen.getByRole("status")).toHaveTextContent(defaultMessages.connecting);
  });

  it("shows the text of a message as text, never as HTML", () => {
    const text = '<img src=x onerror="alert(1)"> <b>bold</b>';
    const { log } = renderList(chatState([serverMessage("1", { text })]));

    expect(screen.getByText(text)).toBeInTheDocument();
    expect(log.querySelector("img, b")).toBeNull();
  });

  it("shows Retry only on a failed message, and retries that message", () => {
    const chat = chatState([mine("1"), mine("2", { status: "failed" })]);
    renderList(chat);

    const buttons = screen.getAllByRole("button", { name: "Retry" });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);

    expect(chat.retry).toHaveBeenCalledWith("client-2");
  });

  it("moves the focus to the list when Retry is pressed, because the button is removed", () => {
    const failed = mine("2", { status: "failed" });
    const { log, update } = renderList(chatState([failed]));
    const button = screen.getByRole("button", { name: "Retry" });
    button.focus();

    fireEvent.click(button);
    update(chatState([{ ...failed, status: "sending" }]));

    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(document.activeElement).toBe(log);
  });
});

describe("MessageList: older pages", () => {
  it("loads an older page when the button is pressed", () => {
    const chat = chatState(many(1, 3));
    renderList(chat);

    fireEvent.click(screen.getByRole("button", { name: "Load older messages" }));

    expect(chat.loadOlder).toHaveBeenCalledTimes(1);
  });

  it("loads an older page when the user scrolls close to the top", () => {
    const chat = chatState(many(1, 20));
    const { scrollTo } = renderList(chat);

    scrollTo(300);
    expect(chat.loadOlder).not.toHaveBeenCalled();

    scrollTo(30);
    expect(chat.loadOlder).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a page is loading", { loadStatus: "loading" }],
    ["the last request failed", { loadStatus: "error" }],
    ["there is nothing older", { hasOlder: false }],
  ] as const)("does not load on scroll while %s", (_name, overrides) => {
    const chat = chatState(many(1, 20), overrides);
    const { scrollTo } = renderList(chat);

    scrollTo(0);

    expect(chat.loadOlder).not.toHaveBeenCalled();
  });

  it("keeps the button while a page loads, marks it as busy, and marks the log as busy", () => {
    const { log } = renderList(chatState(many(1, 3), { loadStatus: "loading" }));

    const button = screen.getByRole("button", { name: "Loading…" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(log).toHaveAttribute("aria-busy", "true");
  });

  it("says that loading failed, in an alert, and offers the same button again", () => {
    const chat = chatState([], { loadStatus: "error" });
    renderList(chat);

    expect(screen.getByRole("alert")).toHaveTextContent("Could not load the messages.");
    fireEvent.click(screen.getByRole("button", { name: "Load older messages" }));
    expect(chat.loadOlder).toHaveBeenCalledTimes(1);
  });

  it("shows no button when there is nothing older", () => {
    renderList(chatState(many(1, 3), { hasOlder: false }));

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("keeps the visible rows in place when an older page is added on top", () => {
    const { log, update, scrollTo } = renderList(chatState(many(11, 30)));
    scrollTo(120);

    // 10 rows of 50px are added above.
    update(chatState(many(1, 30)));

    expect(log.scrollTop).toBe(120 + 10 * ROW_PX);
  });

  it("keeps the place also when the user scrolled while the page was loading", () => {
    const { log, update, scrollTo } = renderList(chatState(many(11, 30)));
    scrollTo(20);
    update(chatState(many(11, 30), { loadStatus: "loading" }));
    scrollTo(260);

    update(chatState(many(1, 30)));

    expect(log.scrollTop).toBe(260 + 10 * ROW_PX);
  });
});

describe("MessageList: new messages", () => {
  it("starts at the bottom", () => {
    const { log } = renderList(chatState(many(1, 20)));

    expect(log.scrollTop).toBe(20 * ROW_PX);
  });

  it("goes to the bottom when the first page arrives after an empty start", () => {
    const { log, update } = renderList(chatState([], { loadStatus: "loading" }));

    update(chatState(many(1, 20)));

    expect(log.scrollTop).toBe(20 * ROW_PX);
  });

  it("stays at the bottom when a message arrives and the user is at the bottom", () => {
    const { log, update } = renderList(chatState(many(1, 20)));

    update(chatState(many(1, 21)));

    expect(log.scrollTop).toBe(21 * ROW_PX);
    expect(screen.queryByRole("button", { name: "New messages" })).toBeNull();
  });

  it("does not move and shows New messages when a message arrives while the user reads older ones", () => {
    const { log, update, scrollTo } = renderList(chatState(many(1, 20)));
    scrollTo(300);

    update(chatState(many(1, 21)));

    expect(log.scrollTop).toBe(300);
    expect(screen.getByRole("button", { name: "New messages" })).toBeInTheDocument();
  });

  it("goes to the bottom and moves the focus to the list when New messages is pressed", () => {
    const { log, update, scrollTo } = renderList(chatState(many(1, 20)));
    scrollTo(300);
    update(chatState(many(1, 21)));
    const button = screen.getByRole("button", { name: "New messages" });
    button.focus();

    fireEvent.click(button);

    expect(log.scrollTop).toBe(21 * ROW_PX);
    expect(screen.queryByRole("button", { name: "New messages" })).toBeNull();
    expect(document.activeElement).toBe(log);
  });

  it("hides New messages when the user scrolls to the bottom by hand", () => {
    const { update, scrollTo } = renderList(chatState(many(1, 20)));
    scrollTo(300);
    update(chatState(many(1, 21)));

    scrollTo(21 * ROW_PX - VIEW_PX);

    expect(screen.queryByRole("button", { name: "New messages" })).toBeNull();
  });

  it("goes to the bottom for my own new message, also when I was reading older ones", () => {
    const { log, update, scrollTo } = renderList(chatState(many(1, 20)));
    scrollTo(300);

    const own: Message = { ...mine("99"), id: undefined, status: "sending" };
    update(chatState([...many(1, 20), own]));

    expect(log.scrollTop).toBe(21 * ROW_PX);
    expect(screen.queryByRole("button", { name: "New messages" })).toBeNull();
  });

  it("does not show New messages when only a status changes", () => {
    const messages = [...many(1, 20), mine("21", { status: "sending" })];
    const { log, update, scrollTo } = renderList(chatState(messages));
    scrollTo(300);

    update(chatState([...many(1, 20), mine("21", { status: "sent" })]));

    expect(log.scrollTop).toBe(300);
    expect(screen.queryByRole("button", { name: "New messages" })).toBeNull();
  });
});
