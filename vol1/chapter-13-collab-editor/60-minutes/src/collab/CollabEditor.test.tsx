/*
 * NOT PART OF THE INTERVIEW.
 * Tests for the textarea: typing reaches the session, remote edits change
 * the text, the caret stays after the same character, and Ctrl+Z is ours.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { CollabEditor } from "./CollabEditor";
import { CollabSession } from "./session";
import { createFakeServer, createTestLink, deliverAll } from "./testNetwork";

const FLUSH_MS = 50;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** One editor on the page, and a second person who has no page. */
function setup() {
  const server = createFakeServer();
  const local = createTestLink(server, new CollabSession({ site: "a", flushMs: FLUSH_MS }));
  const remote = createTestLink(server, new CollabSession({ site: "b", flushMs: FLUSH_MS }));
  local.open();
  remote.open();
  deliverAll([local, remote]);
  render(<CollabEditor session={local.session} label="Document" />);
  const textarea = screen.getByRole("textbox", { name: "Document" }) as HTMLTextAreaElement;

  /** Sends what waits and delivers everything. */
  const settle = () =>
    act(() => {
      vi.advanceTimersByTime(FLUSH_MS);
      deliverAll([local, remote]);
    });
  /** The other person changes their text. */
  const remoteEdit = (text: string, caret: number) => {
    remote.session.edit(text, caret);
    settle();
  };
  return { server, local, remote, textarea, settle, remoteEdit };
}

/** What the browser does on a key press: a new value, a new caret, then the event. */
function typeText(textarea: HTMLTextAreaElement, value: string, caret = value.length) {
  fireEvent.change(textarea, { target: { value, selectionStart: caret, selectionEnd: caret } });
}

/** What the browser does when the user moves the caret. */
function moveCaret(textarea: HTMLTextAreaElement, start: number, end = start) {
  textarea.setSelectionRange(start, end);
  fireEvent.select(textarea);
}

describe("CollabEditor", () => {
  it("is a textarea with a label", () => {
    const { textarea } = setup();

    expect(textarea.tagName).toBe("TEXTAREA");
    expect(textarea).toHaveValue("");
  });

  it("shows what the user types, and the other person gets it", () => {
    const { textarea, remote, settle } = setup();

    typeText(textarea, "h");
    typeText(textarea, "hi");
    settle();

    expect(textarea).toHaveValue("hi");
    expect(remote.session.doc.text()).toBe("hi");
  });

  it("shows the text that another person typed", () => {
    const { textarea, remoteEdit } = setup();

    remoteEdit("hello", 5);

    expect(textarea).toHaveValue("hello");
  });

  it("keeps the caret after the same character when another person types before it", () => {
    const { textarea, settle, remoteEdit } = setup();
    typeText(textarea, "world");
    settle();
    moveCaret(textarea, 3); // wor|ld

    remoteEdit("hello world", 6);

    expect(textarea).toHaveValue("hello world");
    expect(textarea.selectionStart).toBe(9); // hello wor|ld
    expect(textarea.selectionEnd).toBe(9);
  });

  it("does not move the caret when another person types after it", () => {
    const { textarea, settle, remoteEdit } = setup();
    typeText(textarea, "hello");
    settle();
    moveCaret(textarea, 2);

    remoteEdit("hello world", 11);

    expect(textarea.selectionStart).toBe(2);
  });

  it("keeps both ends of a selection on the same characters", () => {
    const { textarea, settle, remoteEdit } = setup();
    typeText(textarea, "one two three");
    settle();
    moveCaret(textarea, 4, 7); // "two"

    remoteEdit(">> one two three", 3);
    remoteEdit(">> one t!wo three", 9);

    expect(textarea.value.slice(textarea.selectionStart, textarea.selectionEnd)).toBe("t!wo");
  });

  it("keeps the caret in place when the character on its left is deleted by another person", () => {
    const { textarea, settle, remoteEdit } = setup();
    typeText(textarea, "abcd");
    settle();
    moveCaret(textarea, 2); // ab|cd

    remoteEdit("acd", 1);

    expect(textarea).toHaveValue("acd");
    expect(textarea.selectionStart).toBe(1); // a|cd
  });

  it("keeps the caret where the user typed, in the middle of the text", () => {
    const { textarea } = setup();
    typeText(textarea, "ac");

    typeText(textarea, "abc", 2);

    expect(textarea.selectionStart).toBe(2);
  });

  it("takes back the last change of this user on Ctrl+Z, not the change of the other person", () => {
    const { textarea, settle, remoteEdit, remote } = setup();
    typeText(textarea, "mine");
    settle();
    remoteEdit("mine theirs", 11);

    const wasNotPrevented = fireEvent.keyDown(textarea, { key: "z", ctrlKey: true });
    settle();

    expect(wasNotPrevented).toBe(false);
    expect(textarea).toHaveValue(" theirs");
    expect(remote.session.doc.text()).toBe(" theirs");
  });

  it("takes back on Cmd+Z too, and with Caps Lock on", () => {
    const { textarea } = setup();
    typeText(textarea, "a");
    typeText(textarea, "ab");

    fireEvent.keyDown(textarea, { key: "z", metaKey: true });
    fireEvent.keyDown(textarea, { key: "Z", ctrlKey: true });

    expect(textarea).toHaveValue("");
  });

  it("stops the redo of the browser, which would bring back a wrong text", () => {
    const { textarea } = setup();
    typeText(textarea, "a");

    const wasNotPrevented = fireEvent.keyDown(textarea, {
      key: "z",
      ctrlKey: true,
      shiftKey: true,
    });

    expect(wasNotPrevented).toBe(false);
    expect(textarea).toHaveValue("a");
  });

  it("leaves a plain z alone", () => {
    const { textarea } = setup();

    expect(fireEvent.keyDown(textarea, { key: "z" })).toBe(true);
  });

  it("tells the user, in a status line, that they are offline and nothing is lost", () => {
    const { local, textarea, settle } = setup();
    expect(screen.getByRole("status")).toHaveTextContent("");

    act(() => local.close());

    expect(screen.getByRole("status")).toHaveTextContent(
      "You are offline. Your changes are kept, and sent when you are back.",
    );
    typeText(textarea, "still typing");
    expect(textarea).toHaveValue("still typing");

    act(() => local.open());
    settle();
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("uses the translated texts and the class name of the parent", () => {
    const session = new CollabSession({ site: "x" });

    const { container } = render(
      <CollabEditor
        session={session}
        label="दस्तावेज़"
        messages={{ offline: "आप ऑफ़लाइन हैं।" }}
        className="mine"
      />,
    );

    expect(screen.getByRole("textbox", { name: "दस्तावेज़" })).toBeInTheDocument();
    expect(container.querySelector('[role="status"]')).toHaveTextContent("आप ऑफ़लाइन हैं।");
    expect(container.firstChild).toHaveClass("collab-editor", "mine");
  });

  it("follows a new session when the `session` prop changes", () => {
    const first = new CollabSession({ site: "a" });
    const second = new CollabSession({ site: "b" });
    second.edit("second", 6);
    const { rerender } = render(<CollabEditor session={first} label="Doc" />);

    rerender(<CollabEditor session={second} label="Doc" />);
    const textarea = screen.getByRole("textbox", { name: "Doc" }) as HTMLTextAreaElement;
    typeText(textarea, "second!");

    expect(second.doc.text()).toBe("second!");
    expect(first.doc.text()).toBe("");
    act(() => first.edit("first", 5));
    expect(textarea).toHaveValue("second!");
  });

  it("holds Hindi text and emoji", () => {
    const { textarea, remote, settle } = setup();

    typeText(textarea, "नमस्ते 😀");
    settle();

    expect(remote.session.doc.text()).toBe("नमस्ते 😀");
  });
});
