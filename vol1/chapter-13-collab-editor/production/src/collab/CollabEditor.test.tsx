/*
 * NOT PART OF THE INTERVIEW: production version.
 * Tests for the textarea on top of an engine: the caret, the carets of other
 * people, Ctrl+Z, input methods, the line for screen readers, and both
 * engines behind the same component.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { createCrdtServer } from "../server/crdtServer";
import { createOtServer } from "../server/otServer";
import { CollabEditor } from "./CollabEditor";
import { CrdtEngine } from "./crdt/crdtEngine";
import { OtEngine } from "./ot/otEngine";
import { createTestLink, deliverAll } from "./testNetwork";

const FLUSH_MS = 50;
const PRESENCE_MS = 100;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });
});

afterEach(() => {
  vi.useRealTimers();
});

/** One editor on the page, and a second person who has no page. */
function setup(kind: "crdt" | "ot" = "crdt") {
  const makeLinks = () => {
    if (kind === "crdt") {
      const server = createCrdtServer();
      return ["a", "b"].map((site) =>
        createTestLink(server, new CrdtEngine({ site, name: `Person ${site}`, flushMs: FLUSH_MS })),
      );
    }
    const server = createOtServer();
    return ["a", "b"].map((site) =>
      createTestLink(server, new OtEngine({ site, name: `Person ${site}` })),
    );
  };
  const [local, remote] = makeLinks();
  local.open();
  remote.open();
  deliverAll([local, remote]);
  const { container, unmount } = render(<CollabEditor engine={local.session} label="Document" />);
  const textarea = screen.getByRole("textbox", { name: "Document" }) as HTMLTextAreaElement;

  /** Sends what waits and delivers everything. */
  const settle = (ms = PRESENCE_MS) =>
    act(() => {
      vi.advanceTimersByTime(ms);
      deliverAll([local, remote]);
    });
  /** The other person changes their text. */
  const remoteEdit = (text: string, caret: number) => {
    remote.session.edit(text, caret);
    settle();
  };
  return { local, remote, textarea, container, unmount, settle, remoteEdit };
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

describe.each(["crdt", "ot"] as const)("CollabEditor with the %s engine", (kind) => {
  it("shows what the user types, and the other person gets it", () => {
    const { textarea, remote, settle } = setup(kind);

    typeText(textarea, "h");
    typeText(textarea, "hi");
    settle();

    expect(textarea).toHaveValue("hi");
    expect(remote.session.text()).toBe("hi");
  });

  it("shows the text that another person typed", () => {
    const { textarea, remoteEdit } = setup(kind);

    remoteEdit("hello", 5);

    expect(textarea).toHaveValue("hello");
  });

  it("keeps the caret after the same character when another person types before it", () => {
    const { textarea, settle, remoteEdit } = setup(kind);
    typeText(textarea, "world");
    settle();
    moveCaret(textarea, 3); // wor|ld

    remoteEdit("hello world", 6);

    expect(textarea).toHaveValue("hello world");
    expect(textarea.selectionStart).toBe(9); // hello wor|ld
    expect(textarea.selectionEnd).toBe(9);
  });

  it("keeps both ends of a selection on the same characters", () => {
    const { textarea, settle, remoteEdit } = setup(kind);
    typeText(textarea, "one two three");
    settle();
    moveCaret(textarea, 4, 7); // "two"

    remoteEdit(">> one two three", 3);
    remoteEdit(">> one t!wo three", 9);

    expect(textarea.value.slice(textarea.selectionStart, textarea.selectionEnd)).toBe("t!wo");
  });

  it("keeps the caret in place when the character on its left is deleted by another person", () => {
    const { textarea, settle, remoteEdit } = setup(kind);
    typeText(textarea, "abcd");
    settle();
    moveCaret(textarea, 2); // ab|cd

    remoteEdit("acd", 1);

    expect(textarea).toHaveValue("acd");
    expect(textarea.selectionStart).toBe(1); // a|cd
  });

  it("gives both people the same text after they typed at the same place at the same time", () => {
    const { textarea, remote, settle } = setup(kind);

    typeText(textarea, "hello");
    remote.session.edit("world", 5);
    settle();

    expect(textarea).toHaveValue(remote.session.text());
    expect(["helloworld", "worldhello"]).toContain(textarea.value);
  });

  it("tells the user, in a status line, that they are offline and nothing is lost", () => {
    const { local, remote, textarea, settle } = setup(kind);

    act(() => local.close());

    expect(screen.getAllByRole("status")[0]).toHaveTextContent(
      "You are offline. Your changes are kept, and sent when you are back.",
    );
    typeText(textarea, "still typing");
    act(() => local.open());
    settle();
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("");
    expect(remote.session.text()).toBe("still typing");
  });

  it("holds remote changes while the user builds a character, and shows them after", () => {
    const { textarea, remoteEdit, settle } = setup(kind);

    fireEvent.compositionStart(textarea);
    remoteEdit("hello", 5);
    expect(textarea).toHaveValue("");
    typeText(textarea, "न");
    fireEvent.compositionEnd(textarea);
    settle();

    expect(textarea.value).toContain("hello");
    expect(textarea.value).toContain("न");
  });

  it("shows text that looks like HTML as text", () => {
    const { textarea, container, remoteEdit } = setup(kind);
    const attack = '<img src=x onerror="alert(1)">';

    remoteEdit(attack, attack.length);

    expect(textarea).toHaveValue(attack);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".collab-editor__presence")).toHaveTextContent(attack);
  });
});

describe("CollabEditor: undo", () => {
  it("takes back the last change of this user on Ctrl+Z, not the change of the other person", () => {
    const { textarea, settle, remoteEdit, remote } = setup();
    typeText(textarea, "mine");
    settle();
    remoteEdit("mine theirs", 11);

    const wasNotPrevented = fireEvent.keyDown(textarea, { key: "z", ctrlKey: true });
    settle();

    expect(wasNotPrevented).toBe(false);
    expect(textarea).toHaveValue(" theirs");
    expect(remote.session.text()).toBe(" theirs");
  });

  it("takes back on Cmd+Z too, and with Caps Lock on", () => {
    const { textarea } = setup();
    typeText(textarea, "a");
    typeText(textarea, "ab");

    fireEvent.keyDown(textarea, { key: "z", metaKey: true });
    fireEvent.keyDown(textarea, { key: "Z", ctrlKey: true });

    expect(textarea).toHaveValue("");
  });

  it("stops the redo of the browser, and leaves a plain z alone", () => {
    const { textarea } = setup();
    typeText(textarea, "a");

    expect(fireEvent.keyDown(textarea, { key: "z", ctrlKey: true, shiftKey: true })).toBe(false);
    expect(fireEvent.keyDown(textarea, { key: "z" })).toBe(true);
    expect(textarea).toHaveValue("a");
  });
});

describe("CollabEditor: the carets of other people", () => {
  it("draws the name of the other person at their caret, in a layer that screen readers skip", () => {
    const { textarea, container, remote, settle } = setup();
    typeText(textarea, "hello world");
    settle();

    remote.session.setSelection(5, 5);
    settle();

    const layer = container.querySelector(".collab-editor__presence") as HTMLElement;
    expect(layer).toHaveAttribute("aria-hidden", "true");
    const caret = layer.querySelector(".collab-editor__caret") as HTMLElement;
    expect(caret).toHaveTextContent("Person b");
    // The caret sits between "hello" and " world".
    expect(caret.previousSibling?.textContent).toBe("hello");
    expect(caret.nextSibling?.textContent).toBe(" world");
  });

  it("marks the selection of the other person", () => {
    const { textarea, container, remote, settle } = setup();
    typeText(textarea, "hello world");
    settle();

    remote.session.setSelection(6, 11);
    settle();

    expect(container.querySelector(".collab-editor__presence mark")).toHaveTextContent("world");
  });

  it("moves the caret of the other person with the text, when this user types before it", () => {
    const { textarea, container, remote, settle } = setup();
    typeText(textarea, "world");
    settle();
    remote.session.setSelection(5, 5);
    settle();

    typeText(textarea, "hello world", 6);

    const caret = container.querySelector(".collab-editor__caret") as HTMLElement;
    expect(caret.previousSibling?.textContent).toBe("hello world");
  });

  it("keeps the layer text equal to the text of the textarea", () => {
    const { textarea, container, remote, settle } = setup();
    typeText(textarea, "line one\nline two\n");
    remote.session.setSelection(3, 12);
    settle();

    const layer = container.querySelector(".collab-editor__presence") as HTMLElement;
    const names = [...layer.querySelectorAll(".collab-editor__caret-name")].map(
      (name) => name.textContent,
    );
    let layerText = layer.textContent ?? "";
    names.forEach((name) => {
      layerText = layerText.replace(name ?? "", "");
    });

    expect(layerText.replace("​", "")).toBe(textarea.value);
  });

  it("lists the other people by name, for everybody, and removes one who leaves", () => {
    const { remote, settle } = setup();
    remote.session.setSelection(0, 0);
    settle();

    const list = screen.getByRole("list", { name: "Also here" });
    expect(within(list).getByText("Person b")).toBeInTheDocument();
    act(() => remote.close());
    settle();

    expect(within(list).queryByText("Person b")).toBeNull();
  });

  it("shows a name that looks like HTML as text", () => {
    const server = createCrdtServer();
    const local = createTestLink(server, new CrdtEngine({ site: "a", name: "A" }));
    const remote = createTestLink(
      server,
      new CrdtEngine({ site: "b", name: "<b>Eve</b><script>" }),
    );
    local.open();
    remote.open();
    const { container } = render(<CollabEditor engine={local.session} label="Document" />);

    act(() => {
      deliverAll([local, remote]);
      vi.advanceTimersByTime(PRESENCE_MS);
      deliverAll([local, remote]);
    });

    expect(container.querySelector(".collab-editor__caret-name")).toHaveTextContent(
      "<b>Eve</b><script>",
    );
    expect(container.querySelector("b, script")).toBeNull();
  });
});

describe("CollabEditor: the line for screen readers", () => {
  it("says once that another person changed the text, not once for each change", () => {
    const { remoteEdit } = setup();
    const line = screen.getByTestId("announcement");
    expect(line).toHaveAttribute("role", "status");
    expect(line).toHaveTextContent("");

    remoteEdit("h", 1);
    expect(line).toHaveTextContent("Another person changed the text.");
    remoteEdit("he", 2);
    remoteEdit("hel", 3);

    expect(line).toHaveTextContent("Another person changed the text.");
  });

  it("empties the line after two seconds, and says it again after ten", () => {
    const { remoteEdit, settle } = setup();
    const line = screen.getByTestId("announcement");
    remoteEdit("h", 1);

    settle(2000);
    expect(line).toHaveTextContent("");
    remoteEdit("he", 2); // Three seconds after the first: too early.
    expect(line).toHaveTextContent("");
    settle(10_000);
    remoteEdit("hel", 3);

    expect(line).toHaveTextContent("Another person changed the text.");
  });

  it("says nothing for the changes of this user", () => {
    const { textarea, settle } = setup();

    typeText(textarea, "hello");
    settle();

    expect(screen.getByTestId("announcement")).toHaveTextContent("");
  });
});

describe("CollabEditor: props", () => {
  it("uses the translated texts and the class name of the parent", () => {
    const engine = new CrdtEngine({ site: "x", name: "X" });

    const { container } = render(
      <CollabEditor
        engine={engine}
        label="दस्तावेज़"
        messages={{ offline: "आप ऑफ़लाइन हैं।", peopleHere: "यहाँ भी" }}
        className="mine"
      />,
    );

    expect(screen.getByRole("textbox", { name: "दस्तावेज़" })).toBeInTheDocument();
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("आप ऑफ़लाइन हैं।");
    expect(screen.getByRole("list", { name: "यहाँ भी" })).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("collab-editor", "mine");
  });

  it("follows a new engine when the `engine` prop changes", () => {
    const first = new CrdtEngine({ site: "a", name: "A" });
    const second = new OtEngine({ site: "b", name: "B" });
    second.edit("second", 6);
    const { rerender } = render(<CollabEditor engine={first} label="Doc" />);

    rerender(<CollabEditor engine={second} label="Doc" />);
    const textarea = screen.getByRole("textbox", { name: "Doc" }) as HTMLTextAreaElement;
    typeText(textarea, "second!");

    expect(second.text()).toBe("second!");
    expect(first.text()).toBe("");
  });

  it("lets remote changes in again when it is removed in the middle of a character", () => {
    const { local, textarea, unmount, remoteEdit } = setup();
    fireEvent.compositionStart(textarea);
    remoteEdit("hel", 3);
    expect(local.session.text()).toBe("");

    unmount();
    remoteEdit("hello", 5);

    expect(local.session.text()).toBe("hello");
  });

  it("holds Hindi text and emoji", () => {
    const { textarea, remote, settle } = setup();

    typeText(textarea, "नमस्ते 😀");
    settle();

    expect(remote.session.text()).toBe("नमस्ते 😀");
  });
});
