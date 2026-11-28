/* NOT PART OF THE INTERVIEW. Tests of the text box. */
import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { Composer } from "./Composer";
import { defaultMessages } from "./messages";
import { MAX_MESSAGE_LENGTH } from "./types";

function renderComposer(onSend = vi.fn((_text: string) => true)) {
  render(<Composer text={defaultMessages} onSend={onSend} />);
  const input = screen.getByRole("textbox", { name: "Message" }) as HTMLTextAreaElement;
  const type = (text: string) => fireEvent.change(input, { target: { value: text } });
  return { input, type, onSend };
}

describe("Composer", () => {
  it("has a text box with a visible label", () => {
    const { input } = renderComposer();

    expect(input).toHaveAccessibleName("Message");
    expect(screen.getByText("Message")).toBeVisible();
  });

  it("takes its two texts from `text`", () => {
    render(
      <Composer
        text={{ ...defaultMessages, composerLabel: "संदेश", send: "भेजें" }}
        onSend={() => true}
      />,
    );

    expect(screen.getByRole("textbox", { name: "संदेश" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "भेजें" })).toBeInTheDocument();
  });

  it("sends on Enter, empties the box and keeps the focus in it", () => {
    const { input, type, onSend } = renderComposer();
    input.focus();
    type("hello");

    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSend).toHaveBeenCalledWith("hello");
    expect(input.value).toBe("");
    expect(document.activeElement).toBe(input);
  });

  it("stops the browser from adding a new line for the Enter that sends", () => {
    const { input, type } = renderComposer();
    type("hello");

    const enter = createEvent.keyDown(input, { key: "Enter" });
    fireEvent(input, enter);

    expect(enter.defaultPrevented).toBe(true);
  });

  it("does not send on Shift+Enter, and lets the browser add the new line", () => {
    const { input, type, onSend } = renderComposer();
    type("line one");

    const shiftEnter = createEvent.keyDown(input, { key: "Enter", shiftKey: true });
    fireEvent(input, shiftEnter);

    expect(onSend).not.toHaveBeenCalled();
    expect(shiftEnter.defaultPrevented).toBe(false);
  });

  it("does not send on the Enter that confirms a word in an IME", () => {
    const { input, type, onSend } = renderComposer();
    type("こん");

    fireEvent.keyDown(input, { key: "Enter", isComposing: true });

    expect(onSend).not.toHaveBeenCalled();
    expect(input.value).toBe("こん");
  });

  it("does not send on the IME Enter of Safari, which has keyCode 229", () => {
    const { input, type, onSend } = renderComposer();
    type("नम");

    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });

    expect(onSend).not.toHaveBeenCalled();
  });

  it("keeps the text when the message is not accepted", () => {
    const { input, type, onSend } = renderComposer(vi.fn(() => false));
    type("   ");

    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSend).toHaveBeenCalledWith("   ");
    expect(input.value).toBe("   ");
  });

  it("sends with the Send button and moves the focus back to the text box", () => {
    const { input, type, onSend } = renderComposer();
    type("hello");
    const button = screen.getByRole("button", { name: "Send" });
    button.focus();

    fireEvent.click(button);

    expect(onSend).toHaveBeenCalledWith("hello");
    expect(input.value).toBe("");
    expect(document.activeElement).toBe(input);
  });

  it("does not let the user type more than the length limit", () => {
    const { input } = renderComposer();

    expect(input).toHaveAttribute("maxlength", String(MAX_MESSAGE_LENGTH));
  });

  it("does nothing on other keys", () => {
    const { input, type, onSend } = renderComposer();
    type("hello");

    fireEvent.keyDown(input, { key: "a" });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(onSend).not.toHaveBeenCalled();
  });
});
