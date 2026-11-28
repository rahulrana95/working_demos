/*
 * NOT PART OF THE INTERVIEW.
 * Tests of the list. jsdom does no layout, so the tests give the list a
 * height: every message is 50px tall and the list shows 200px of them.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MessageList } from "./MessageList";
import { defaultMessages } from "./messages";
import type { ChatMessages } from "./messages";
import { serverMessage } from "./testUtils";
import type { ChatState } from "./useChat";
import { REVEAL_STEP, WINDOW_SIZE } from "./windowing";
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
      return this.querySelectorAll(":scope > .message").length * ROW_PX;
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
    isPeerTyping: false,
    loadOlder: vi.fn(),
    send: vi.fn(() => true),
    sendImage: vi.fn(() => true),
    retry: vi.fn(),
    cancel: vi.fn(),
    notifyTyping: vi.fn(),
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
  const rowCount = () => log.querySelectorAll(".message").length;
  const firstText = () => log.querySelector(".message__text")?.textContent;
  return { log, update, scrollTo, rowCount, firstText };
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
        mine("2", { createdAt: at }),
        mine("3", { status: "delivered", createdAt: at }),
        mine("4", { status: "read", createdAt: at }),
        mine("1", { id: undefined, status: "sending", createdAt: at }),
        mine("5", { id: undefined, status: "failed", createdAt: at }),
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
    renderList(chatState([serverMessage("1", { createdAt: at, status: "read" })]));

    expect(screen.getByText("Ravi · 9:30 PM")).toBeInTheDocument();
  });

  it("writes the time in the way of the locale", () => {
    const at = new Date(2026, 0, 5, 21, 30).getTime();
    renderList(chatState([serverMessage("1", { createdAt: at })]), defaultMessages, "de-DE");

    expect(screen.getByText("Ravi · 21:30")).toBeInTheDocument();
  });

  it("draws a message with a broken time without a time, and does not crash", () => {
    renderList(
      chatState([
        serverMessage("1", { createdAt: Number.NaN }),
        serverMessage("2", { createdAt: 9e15 }),
      ]),
    );

    expect(screen.getAllByText("Ravi")).toHaveLength(2);
  });

  it("shows the text of a message as text, never as HTML", () => {
    const text = '<img src=x onerror="alert(1)"> <b>bold</b>';
    const { log } = renderList(chatState([serverMessage("1", { text })]));

    expect(screen.getByText(text)).toBeInTheDocument();
    expect(log.querySelector("img, b")).toBeNull();
  });

  it("shows Retry and Cancel on a failed message, and calls the hook with its clientId", () => {
    const chat = chatState([mine("1"), mine("2", { id: undefined, status: "failed" })]);
    renderList(chat);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getAllByRole("button", { name: "Retry" })).toHaveLength(1);
    expect(chat.retry).toHaveBeenCalledWith("client-2");
    expect(chat.cancel).toHaveBeenCalledWith("client-2");
  });

  it("moves the focus to the list when Retry is pressed, because the button is removed", () => {
    const failed = mine("2", { id: undefined, status: "failed" });
    const { log, update } = renderList(chatState([failed]));
    const button = screen.getByRole("button", { name: "Retry" });
    button.focus();

    fireEvent.click(button);
    update(chatState([{ ...failed, status: "sending" }]));

    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(document.activeElement).toBe(log);
  });

  it("takes every text from `text`: no English is fixed in the list", () => {
    const text = Object.fromEntries(
      Object.keys(defaultMessages).map((key, index) => [key, `#${index}#`]),
    ) as unknown as ChatMessages;
    const uploading = mine("22", {
      id: undefined,
      status: "sending",
      attachment: { url: "blob:x", name: "" },
      uploadProgress: 0.2,
    });
    const failed = mine("21", { id: undefined, status: "failed" });
    const { update, scrollTo } = renderList(
      chatState([...many(1, 20), failed, uploading], { loadStatus: "error", isOpen: false }),
      text,
    );
    const expectNoEnglish = () => {
      const shown = document.body.textContent ?? "";
      for (const english of Object.values(defaultMessages)) {
        if (typeof english === "string") {
          expect(shown).not.toContain(english);
        }
      }
    };
    expectNoEnglish();
    expect(screen.getByRole("button", { name: text.retry })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(text.loadFailed);
    expect(screen.getByRole("img")).toHaveAccessibleName(text.image);

    scrollTo(300);
    update(chatState([...many(1, 23)], { loadStatus: "loading", isOpen: false }));

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
});

describe("MessageList production: links and images", () => {
  it("makes a web address a link that opens a new tab and tells the other site nothing", () => {
    renderList(chatState([serverMessage("1", { text: "Look at https://example.com/a now" })]));

    const link = screen.getByRole("link", { name: "https://example.com/a" });
    expect(link).toHaveAttribute("href", "https://example.com/a");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link.closest(".message__text")).toHaveTextContent("Look at https://example.com/a now");
  });

  it.each(["javascript:alert(1)", "data:text/html,<b>x</b>", "https://bank.example@evil.example"])(
    "shows %j as plain text, with no link",
    (text) => {
      renderList(chatState([serverMessage("1", { text })]));

      expect(screen.queryByRole("link")).toBeNull();
      expect(screen.getByText(text)).toBeInTheDocument();
    },
  );

  it("shows an image with its file name as text alternative", () => {
    const attachment = { url: "https://files.example/cat.png", name: "cat.png" };
    renderList(chatState([serverMessage("1", { text: "", attachment })]));

    const image = screen.getByRole("img", { name: "cat.png" });
    expect(image).toHaveAttribute("src", "https://files.example/cat.png");
  });

  it("shows the word Image, and no picture, for an address that is not safe", () => {
    const attachment = { url: "javascript:alert(1)", name: "cat.png" };
    const { log } = renderList(chatState([serverMessage("1", { text: "", attachment })]));

    expect(log.querySelector("img")).toBeNull();
    expect(within(log).getByText("Image")).toBeInTheDocument();
  });

  it("shows the progress of an upload with a text alternative, and a Cancel button", () => {
    const uploading = mine("1", {
      id: undefined,
      status: "sending",
      text: "",
      attachment: { url: "blob:http://localhost/1", name: "cat.png" },
      uploadProgress: 0.4,
    });
    const chat = chatState([uploading]);
    renderList(chat);

    const bar = screen.getByRole("progressbar", { name: "Uploading, 40%" });
    expect(bar).toHaveAttribute("value", "40");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(chat.cancel).toHaveBeenCalledWith("client-1");
  });

  it("shows no progress bar and no Cancel when the upload is done or the message is confirmed", () => {
    const attachment = { url: "https://files.example/cat.png", name: "cat.png" };
    renderList(
      chatState([
        mine("1", { text: "", attachment }),
        mine("2", { id: undefined, status: "sending", text: "", attachment, uploadProgress: 1 }),
      ]),
    );

    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  it("moves the focus to the list when Cancel removes the message, and leaves it on a link that was clicked", () => {
    const failed = mine("2", { id: undefined, status: "failed" });
    const { log } = renderList(
      chatState([serverMessage("1", { text: "https://example.com" }), failed]),
    );

    const link = screen.getByRole("link");
    link.focus();
    fireEvent.click(link);
    expect(document.activeElement).toBe(link);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(document.activeElement).toBe(log);
  });
});

describe("MessageList production: a line for every day", () => {
  const day = (dayOfMonth: number, hour: number) => new Date(2026, 0, dayOfMonth, hour).getTime();

  it("writes the date once above the first message of each day", () => {
    const { log } = renderList(
      chatState([
        serverMessage("1", { createdAt: day(5, 9) }),
        serverMessage("2", { createdAt: day(5, 23) }),
        serverMessage("3", { createdAt: day(6, 0) }),
        serverMessage("4", { createdAt: day(8, 12) }),
      ]),
    );

    const lines = [...log.querySelectorAll(".chat__day")].map((line) => line.textContent);
    expect(lines).toEqual([
      "Monday, January 5, 2026",
      "Tuesday, January 6, 2026",
      "Thursday, January 8, 2026",
    ]);
    expect(log.children[0]).toHaveClass("chat__day");
    expect(log.children[3]).toHaveClass("chat__day");
  });

  it("writes the date in the way of the locale", () => {
    const { log } = renderList(
      chatState([serverMessage("1", { createdAt: day(5, 9) })]),
      defaultMessages,
      "hi-IN",
    );

    expect(log.querySelector(".chat__day")).toHaveTextContent("सोमवार, 5 जनवरी 2026");
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

  it("says that loading failed, in an alert, and the button asks for the same page again", () => {
    const chat = chatState([], { loadStatus: "error" });
    renderList(chat);

    expect(screen.getByRole("alert")).toHaveTextContent("Could not load the messages.");
    fireEvent.click(screen.getByRole("button", { name: "Load older messages" }));
    expect(chat.loadOlder).toHaveBeenCalledTimes(1);
  });

  it("shows no button when there is nothing older, on the server or in memory", () => {
    renderList(chatState(many(1, 3), { hasOlder: false }));

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("keeps the visible rows in place when the older page it asked for arrives", () => {
    const { log, update, scrollTo, rowCount } = renderList(chatState(many(11, 30)));
    scrollTo(20);
    update(chatState(many(11, 30), { loadStatus: "loading" }));

    // 10 rows of 50px are added above.
    update(chatState(many(1, 30)));

    expect(rowCount()).toBe(30);
    expect(log.scrollTop).toBe(20 + 10 * ROW_PX);
  });

  it("keeps the place also when the user scrolled while the page was loading", () => {
    const { log, update, scrollTo } = renderList(chatState(many(11, 30)));
    scrollTo(20);
    update(chatState(many(11, 30), { loadStatus: "loading" }));
    scrollTo(260);

    update(chatState(many(1, 30)));

    expect(log.scrollTop).toBe(260 + 10 * ROW_PX);
  });

  it("does not draw a page that arrived without the user asking for older messages", () => {
    const { log, update, scrollTo, rowCount } = renderList(chatState(many(11, 30)));
    scrollTo(300);

    update(chatState(many(1, 30)));

    expect(rowCount()).toBe(20);
    expect(log.scrollTop).toBe(300);
  });
});

describe("MessageList production: the window", () => {
  it("draws 100 rows of 5,000 loaded messages, the newest ones", () => {
    const { rowCount, firstText } = renderList(chatState(many(1, 5000)));

    expect(rowCount()).toBe(WINDOW_SIZE);
    expect(firstText()).toBe("text 4901");
  });

  it("still draws 100 rows after 50 new messages arrive at the bottom", () => {
    const { log, update, rowCount, firstText } = renderList(chatState(many(1, 5000)));

    update(chatState(many(1, 5050)));

    expect(rowCount()).toBe(WINDOW_SIZE);
    expect(firstText()).toBe("text 4951");
    expect(log.scrollTop).toBe(WINDOW_SIZE * ROW_PX);
  });

  it("removes no row on top while the user reads older messages and new ones arrive", () => {
    const { log, update, scrollTo, rowCount, firstText } = renderList(chatState(many(1, 5000)));
    scrollTo(2000);

    update(chatState(many(1, 5003)));

    expect(firstText()).toBe("text 4901");
    expect(rowCount()).toBe(WINDOW_SIZE + 3);
    expect(log.scrollTop).toBe(2000);
    expect(screen.getByRole("button", { name: "New messages" })).toBeInTheDocument();
  });

  it("adds 50 older rows from memory near the top, asks the server for nothing, and keeps the place", () => {
    const chat = chatState(many(1, 5000));
    const { log, scrollTo, rowCount, firstText } = renderList(chat);
    scrollTo(2000);

    scrollTo(10);

    expect(chat.loadOlder).not.toHaveBeenCalled();
    expect(rowCount()).toBe(WINDOW_SIZE + REVEAL_STEP);
    expect(firstText()).toBe("text 4851");
    expect(log.scrollTop).toBe(10 + REVEAL_STEP * ROW_PX);
  });

  it("offers the button for messages in memory, also when the server has nothing older", () => {
    const chat = chatState(many(1, 300), { hasOlder: false });
    const { rowCount } = renderList(chat);

    fireEvent.click(screen.getByRole("button", { name: "Load older messages" }));

    expect(chat.loadOlder).not.toHaveBeenCalled();
    expect(rowCount()).toBe(WINDOW_SIZE + REVEAL_STEP);
  });

  it("asks the server only when the window has reached the first message in memory", () => {
    const chat = chatState(many(1, 120));
    const { scrollTo, rowCount } = renderList(chat);
    scrollTo(2000);

    scrollTo(10);
    expect(rowCount()).toBe(120);
    expect(chat.loadOlder).not.toHaveBeenCalled();

    scrollTo(10);
    expect(chat.loadOlder).toHaveBeenCalledTimes(1);
  });

  it("shrinks back to 100 rows when the user is at the bottom again", () => {
    const { log, scrollTo, rowCount } = renderList(chatState(many(1, 5000)));
    scrollTo(2000);
    scrollTo(10);
    expect(rowCount()).toBe(150);

    scrollTo(150 * ROW_PX - VIEW_PX);

    expect(rowCount()).toBe(WINDOW_SIZE);
    expect(log.scrollTop).toBe(WINDOW_SIZE * ROW_PX);
  });

  it("shrinks back to 100 rows when New messages is pressed", () => {
    const { update, scrollTo, rowCount } = renderList(chatState(many(1, 5000)));
    scrollTo(2000);
    scrollTo(10);
    update(chatState(many(1, 5001)));

    fireEvent.click(screen.getByRole("button", { name: "New messages" }));

    expect(rowCount()).toBe(WINDOW_SIZE);
  });

  it("follows the newest messages again when a new conversation replaces the list", () => {
    const { update, scrollTo, rowCount, firstText } = renderList(chatState(many(1, 5000)));
    scrollTo(2000);

    update(chatState(many(6001, 6300)));

    expect(rowCount()).toBe(WINDOW_SIZE);
    expect(firstText()).toBe("text 6201");
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

  it("does not jump to the bottom on every step of an upload", () => {
    const own: Message = { ...mine("99"), id: undefined, status: "sending", uploadProgress: 0.1 };
    const { log, update, scrollTo } = renderList(chatState([...many(1, 20), own]));
    scrollTo(300);

    update(chatState([...many(1, 20), { ...own, uploadProgress: 0.6 }]));

    expect(log.scrollTop).toBe(300);
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
