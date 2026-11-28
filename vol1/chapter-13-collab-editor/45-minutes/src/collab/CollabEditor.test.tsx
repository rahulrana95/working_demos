/*
 * NOT PART OF THE INTERVIEW.
 * Tests for the textarea: typing becomes operations, remote operations
 * change the text, and the caret stays after the same character.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { CollabEditor } from "./CollabEditor";
import { Rga } from "./rga";
import type { Op, Transport } from "./types";

/** A transport that the test drives by hand. */
function createTestTransport() {
  const sent: Op[][] = [];
  const listeners = new Set<(ops: Op[]) => void>();
  const transport: Transport = {
    send: (ops) => sent.push(ops),
    subscribe(onOps) {
      listeners.add(onOps);
      return () => listeners.delete(onOps);
    },
  };
  /** Delivers operations from another site. */
  const deliver = (ops: Op[]) => act(() => listeners.forEach((listener) => listener(ops)));
  return { transport, sent, deliver, listeners };
}

function renderEditor(site = "a") {
  const doc = new Rga(site);
  const network = createTestTransport();
  const onTextChange = vi.fn();
  render(
    <CollabEditor
      doc={doc}
      transport={network.transport}
      label="Document"
      onTextChange={onTextChange}
    />,
  );
  const textarea = screen.getByRole("textbox", { name: "Document" }) as HTMLTextAreaElement;
  return { doc, textarea, onTextChange, ...network };
}

/** What the browser does on a key press: a new value, a new caret, then the event. */
function typeText(textarea: HTMLTextAreaElement, value: string, caret = value.length) {
  fireEvent.change(textarea, { target: { value, selectionStart: caret, selectionEnd: caret } });
}

/** Operations of another site that types the text after the given character. */
function remoteTyping(remote: Rga, text: string, afterIndex: number): Op[] {
  let left = afterIndex === 0 ? null : remote.ids()[afterIndex - 1];
  return [...text].map((char) => {
    const op = remote.insertAfter(left, char);
    left = op.id;
    return op;
  });
}

describe("CollabEditor", () => {
  it("is a textarea with a label", () => {
    const { textarea } = renderEditor();

    expect(textarea.tagName).toBe("TEXTAREA");
    expect(textarea).toHaveValue("");
  });

  it("sends one batch of operations for one change, and shows the new text", () => {
    const { textarea, sent, onTextChange } = renderEditor();

    typeText(textarea, "h");
    typeText(textarea, "hi");

    expect(textarea).toHaveValue("hi");
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual([
      {
        type: "insert",
        id: { site: "a", counter: 2 },
        after: { site: "a", counter: 1 },
        char: "i",
      },
    ]);
    expect(onTextChange).toHaveBeenLastCalledWith("hi");
  });

  it("sends nothing when an event does not change the text", () => {
    const { textarea, sent } = renderEditor();
    typeText(textarea, "hi");

    typeText(textarea, "hi", 1);

    expect(sent).toHaveLength(1);
  });

  it("shows the text that another site typed", async () => {
    const { textarea, deliver, onTextChange } = renderEditor();
    const remote = new Rga("b");

    await deliver(remoteTyping(remote, "hello", 0));

    expect(textarea).toHaveValue("hello");
    expect(onTextChange).toHaveBeenLastCalledWith("hello");
  });

  it("keeps the caret after the same character when another site types before it", async () => {
    const { doc, textarea, sent, deliver } = renderEditor();
    const remote = new Rga("b");
    typeText(textarea, "world");
    sent.flat().forEach((op) => remote.apply(op));
    textarea.setSelectionRange(3, 3); // wor|ld

    await deliver(remoteTyping(remote, "hello ", 0));

    expect(textarea).toHaveValue("hello world");
    expect(textarea.selectionStart).toBe(9); // hello wor|ld
    expect(textarea.selectionEnd).toBe(9);
    expect(doc.text()).toBe("hello world");
  });

  it("does not move the caret when another site types after it", async () => {
    const { textarea, sent, deliver } = renderEditor();
    const remote = new Rga("b");
    typeText(textarea, "hello");
    sent.flat().forEach((op) => remote.apply(op));
    textarea.setSelectionRange(2, 2);

    await deliver(remoteTyping(remote, " world", 5));

    expect(textarea).toHaveValue("hello world");
    expect(textarea.selectionStart).toBe(2);
  });

  it("keeps both ends of a selection on the same characters", async () => {
    const { textarea, sent, deliver } = renderEditor();
    const remote = new Rga("b");
    typeText(textarea, "one two three");
    sent.flat().forEach((op) => remote.apply(op));
    textarea.setSelectionRange(4, 7); // "two"

    await deliver(remoteTyping(remote, ">> ", 0));
    await deliver(remoteTyping(remote, "!", 8)); // Inside the selection: ">> one t!wo three".

    expect(textarea).toHaveValue(">> one t!wo three");
    expect(textarea.value.slice(textarea.selectionStart, textarea.selectionEnd)).toBe("t!wo");
  });

  it("keeps the caret in place when the character on its left is deleted by another site", async () => {
    const { textarea, sent, deliver } = renderEditor();
    const remote = new Rga("b");
    typeText(textarea, "abcd");
    sent.flat().forEach((op) => remote.apply(op));
    textarea.setSelectionRange(2, 2); // ab|cd

    await deliver([remote.delete(remote.ids()[1])]);

    expect(textarea).toHaveValue("acd");
    expect(textarea.selectionStart).toBe(1); // a|cd
  });

  it("keeps the caret right when two remote changes arrive before the page is drawn again", async () => {
    const { textarea, sent, listeners } = renderEditor();
    const remote = new Rga("b");
    typeText(textarea, "abc");
    sent.flat().forEach((op) => remote.apply(op));
    textarea.setSelectionRange(2, 2); // ab|c
    const first = remoteTyping(remote, "x", 0);
    const second = remoteTyping(remote, "y", 0);

    // Both in one `act`: React draws once, after the second one.
    await act(() => {
      listeners.forEach((listener) => listener(first));
      listeners.forEach((listener) => listener(second));
    });

    expect(textarea).toHaveValue("yxabc");
    expect(textarea.selectionStart).toBe(4); // yxab|c
  });

  it("does not bring back an old caret after a remote change that changed no text", async () => {
    const { textarea, sent, deliver } = renderEditor();
    const remote = new Rga("b");
    typeText(textarea, "abcd");
    const ops = sent.flat();
    ops.forEach((op) => remote.apply(op));
    textarea.setSelectionRange(1, 1);

    await deliver([ops[0]]); // A duplicate: nothing changes.
    textarea.setSelectionRange(3, 3); // The user moves the caret: abc|d
    await deliver(remoteTyping(remote, "x", 0));

    expect(textarea).toHaveValue("xabcd");
    expect(textarea.selectionStart).toBe(4); // xabc|d
  });

  it("lets a local change win over a caret that was waiting to be put back", async () => {
    const { textarea, deliver } = renderEditor();
    const remote = new Rga("b");
    await deliver(remoteTyping(remote, "abc", 0));

    typeText(textarea, "abcd", 4);

    expect(textarea.selectionStart).toBe(4);
  });

  it("stops listening when it is removed from the page", () => {
    const doc = new Rga("a");
    const { transport, listeners } = createTestTransport();
    const { unmount } = render(<CollabEditor doc={doc} transport={transport} label="Document" />);
    expect(listeners.size).toBe(1);

    unmount();

    expect(listeners.size).toBe(0);
  });

  it("listens once in React strict mode, which runs every effect twice", () => {
    const doc = new Rga("a");
    const { transport, listeners } = createTestTransport();

    render(
      <StrictMode>
        <CollabEditor doc={doc} transport={transport} label="Document" />
      </StrictMode>,
    );

    expect(listeners.size).toBe(1);
  });

  it("shows the text of a new document when the `doc` prop changes", () => {
    const first = new Rga("a");
    const second = new Rga("a2");
    second.insertAfter(null, "z");
    const { transport } = createTestTransport();
    const { rerender } = render(
      <CollabEditor doc={first} transport={transport} label="Document" />,
    );

    rerender(<CollabEditor doc={second} transport={transport} label="Document" />);

    expect(screen.getByRole("textbox")).toHaveValue("z");
  });

  it("moves to a new transport when the `transport` prop changes", async () => {
    const doc = new Rga("a");
    const old = createTestTransport();
    const fresh = createTestTransport();
    const { rerender } = render(
      <CollabEditor doc={doc} transport={old.transport} label="Document" />,
    );

    rerender(<CollabEditor doc={doc} transport={fresh.transport} label="Document" />);
    typeText(screen.getByRole("textbox") as HTMLTextAreaElement, "a");

    expect(old.listeners.size).toBe(0);
    expect(old.sent).toHaveLength(0);
    expect(fresh.sent).toHaveLength(1);
  });
});

describe("two editors", () => {
  function renderTwo() {
    const a = { doc: new Rga("a"), ...createTestTransport() };
    const b = { doc: new Rga("b"), ...createTestTransport() };
    render(
      <>
        <CollabEditor doc={a.doc} transport={a.transport} label="A" />
        <CollabEditor doc={b.doc} transport={b.transport} label="B" />
      </>,
    );
    const textareaA = screen.getByRole("textbox", { name: "A" }) as HTMLTextAreaElement;
    const textareaB = screen.getByRole("textbox", { name: "B" }) as HTMLTextAreaElement;
    return { a, b, textareaA, textareaB };
  }

  it("show the same text after both typed a word at the same place, in both orders of delivery", async () => {
    for (const aFirst of [true, false]) {
      const { a, b, textareaA, textareaB } = renderTwo();
      "hello".split("").forEach((_, index) => typeText(textareaA, "hello".slice(0, index + 1)));
      "world".split("").forEach((_, index) => typeText(textareaB, "world".slice(0, index + 1)));

      if (aFirst) {
        await b.deliver(a.sent.flat());
        await a.deliver(b.sent.flat());
      } else {
        await a.deliver(b.sent.flat());
        await b.deliver(a.sent.flat());
      }

      expect(textareaA).toHaveValue("worldhello");
      expect(textareaB).toHaveValue("worldhello");
      document.body.innerHTML = "";
    }
  });

  it("show the same text when one deletes a word while the other types inside it", async () => {
    const { a, b, textareaA, textareaB } = renderTwo();
    typeText(textareaA, "big red bus");
    await b.deliver(a.sent.flat());
    a.sent.length = 0;

    typeText(textareaA, "big bus", 4); // Deletes "red " (with the space).
    typeText(textareaB, "big red! bus", 8); // Types "!" after "red".
    await b.deliver(a.sent.flat());
    await a.deliver(b.sent.flat());

    expect(textareaA).toHaveValue("big !bus");
    expect(textareaB).toHaveValue(textareaA.value);
  });
});
