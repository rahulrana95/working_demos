/*
 * NOT PART OF THE INTERVIEW.
 * Tests of the whole component: the hook, the list and the text box together.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Chat } from "./Chat";
import { createFakeDeps, serverMessage } from "./testUtils";

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderChat() {
  const fake = createFakeDeps();
  render(<Chat conversationId="c1" peerName="Ravi" {...fake.deps} />);
  fake.pages[0].answer.resolve({
    messages: [serverMessage("1", { text: "Hi Asha" })],
    olderCursor: null,
  });
  await flush();

  const input = screen.getByRole("textbox", { name: "Message to Ravi" }) as HTMLTextAreaElement;
  const sendText = (text: string) => {
    fireEvent.change(input, { target: { value: text } });
    fireEvent.keyDown(input, { key: "Enter" });
  };
  return { ...fake, input, sendText };
}

describe("Chat", () => {
  it("shows the history and the text box", async () => {
    await renderChat();

    expect(screen.getByRole("region", { name: "Chat with Ravi" })).toBeInTheDocument();
    expect(screen.getByText("Hi Asha")).toBeInTheDocument();
  });

  it("shows my message as sending at once, and as sent when the server answers", async () => {
    const { sends, sendText, confirm } = await renderChat();

    sendText("See you at five");

    expect(screen.getByText("See you at five")).toBeInTheDocument();
    expect(screen.getByText(/^You, .*, sending$/)).toBeInTheDocument();

    sends[0].answer.resolve(confirm(sends[0], "2"));
    await flush();

    expect(screen.getByText(/^You, .*, sent$/)).toBeInTheDocument();
    expect(screen.queryByText(/sending$/)).toBeNull();
  });

  it("shows my message once when the server pushes it back to me", async () => {
    const { sends, connections, sendText, confirm } = await renderChat();
    sendText("See you at five");

    act(() => connections[0].push({ type: "message", message: confirm(sends[0], "2") }));
    sends[0].answer.resolve(confirm(sends[0], "2"));
    await flush();

    expect(screen.getAllByText("See you at five")).toHaveLength(1);
  });

  it("shows a failed message with Retry, and Retry sends the same clientId once", async () => {
    const { sends, sendText, confirm } = await renderChat();
    sendText("See you at five");
    sends[0].answer.reject(new Error("500"));
    await flush();

    expect(screen.getByText(/^You, .*, failed$/)).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "Retry" });
    fireEvent.click(retry);
    fireEvent.click(retry);

    expect(sends).toHaveLength(2);
    expect(sends[1].clientId).toBe(sends[0].clientId);

    sends[1].answer.resolve(confirm(sends[1], "2"));
    await flush();
    expect(screen.getByText(/^You, .*, sent$/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("sends nothing for an empty text or for spaces, and keeps what was typed", async () => {
    const { sends, input, sendText } = await renderChat();

    sendText("");
    sendText("   ");

    expect(sends).toHaveLength(0);
    expect(input.value).toBe("   ");
  });

  it("shows a message of the other person when the server pushes it", async () => {
    const { connections } = await renderChat();

    act(() =>
      connections[0].push({ type: "message", message: serverMessage("2", { text: "On my way" }) }),
    );

    expect(screen.getByText("On my way")).toBeInTheDocument();
  });
});
