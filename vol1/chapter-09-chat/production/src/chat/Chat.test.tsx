/*
 * NOT PART OF THE INTERVIEW.
 * Tests of the whole component: the hook, the list and the text box together.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Chat } from "./Chat";
import type { ChatProps } from "./Chat";
import { createFakeDeps, imageFile, serverMessage } from "./testUtils";

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderChat(props: Partial<ChatProps> = {}) {
  const fake = createFakeDeps();
  fake.connections[0].open();
  render(<Chat conversationId="c1" peerName="Ravi" {...fake.deps} {...props} />);
  fake.pages[0].answer.resolve({
    messages: [serverMessage("1", { text: "Hi Asha" })],
    olderCursor: "older",
    newerCursor: "newest",
  });
  await flush();

  const input = screen.getByRole("textbox") as HTMLTextAreaElement;
  const sendText = (text: string) => {
    fireEvent.change(input, { target: { value: text } });
    fireEvent.keyDown(input, { key: "Enter" });
  };
  return { ...fake, input, sendText };
}

describe("Chat", () => {
  it("shows the history and the text box", async () => {
    await renderChat();

    expect(screen.getByRole("log", { name: "Ravi" })).toBeInTheDocument();
    expect(screen.getByText("Hi Asha")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message" })).toBeInTheDocument();
  });

  it("shows my message as sending at once, and as sent when the server answers", async () => {
    const { sends, sendText, confirm } = await renderChat();

    sendText("See you at five");

    expect(screen.getByText("See you at five")).toBeInTheDocument();
    expect(screen.getByText(/^You · .* · Sending…$/)).toBeInTheDocument();

    sends[0].answer.resolve(confirm(sends[0], "2"));
    await flush();

    expect(screen.getByText(/^You · .* · Sent$/)).toBeInTheDocument();
    expect(screen.queryByText(/Sending…$/)).toBeNull();
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

    expect(screen.getByText(/^You · .* · Not sent$/)).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "Retry" });
    fireEvent.click(retry);
    fireEvent.click(retry);

    expect(sends).toHaveLength(2);
    expect(sends[1].clientId).toBe(sends[0].clientId);

    sends[1].answer.resolve(confirm(sends[1], "2"));
    await flush();
    expect(screen.getByText(/^You · .* · Sent$/)).toBeInTheDocument();
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

  it("uses the texts of `messages` and keeps English for the ones left out", async () => {
    await renderChat({
      messages: { composerLabel: "संदेश", send: "भेजें", loadOlder: "पुराने संदेश" },
    });

    expect(screen.getByRole("textbox", { name: "संदेश" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "भेजें" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "पुराने संदेश" })).toBeInTheDocument();
  });

  it("writes the time of a message in the way of `locale`", async () => {
    const { connections } = await renderChat({ locale: "de-DE" });
    const at = new Date(2026, 0, 5, 21, 30).getTime();

    act(() =>
      connections[0].push({ type: "message", message: serverMessage("2", { createdAt: at }) }),
    );

    expect(screen.getByText("Ravi · 21:30")).toBeInTheDocument();
  });

  it("holds a message written without a connection, says so, and sends it when the connection is back", async () => {
    const { sends, connections, sendText, confirm } = await renderChat();

    act(() => connections[0].drop());
    sendText("See you at five");

    expect(screen.getByRole("status")).toHaveTextContent("Connecting…");
    expect(screen.getByText(/^You · .* · Sending…$/)).toBeInTheDocument();
    expect(sends).toHaveLength(0);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1_100));
    });
    act(() => connections[1].open());
    expect(sends).toHaveLength(1);
    sends[0].answer.resolve(confirm(sends[0], "2"));
    await flush();

    expect(screen.getByText(/^You · .* · Sent$/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("shows a line while the other person types, with their name", async () => {
    const { connections } = await renderChat();
    expect(screen.queryByText("Ravi is typing…")).toBeNull();

    act(() => connections[0].push({ type: "typing", conversationId: "c1", userId: "ravi" }));

    expect(screen.getByText("Ravi is typing…")).toBeInTheDocument();
    expect(screen.getByText("Ravi is typing…")).not.toHaveAttribute("aria-live");
  });

  it("tells the server that I type, when I type", async () => {
    const { connections, input } = await renderChat();

    fireEvent.change(input, { target: { value: "h" } });

    expect(connections[0].sent).toContainEqual({ type: "typing", conversationId: "c1" });
  });

  it("offers the image field only when the parent gave an upload function", async () => {
    await renderChat();
    expect(screen.getByLabelText("Send an image")).toBeInTheDocument();
    cleanup();

    await renderChat({ uploadFile: undefined });
    expect(screen.queryByLabelText("Send an image")).toBeNull();
  });

  it("shows an image at once, with its progress, when a file is chosen", async () => {
    URL.createObjectURL = vi.fn(() => "blob:http://localhost/preview");
    URL.revokeObjectURL = vi.fn();
    const { uploads } = await renderChat();

    fireEvent.change(screen.getByLabelText("Send an image"), {
      target: { files: [imageFile("cat.png")] },
    });

    expect(screen.getByRole("img", { name: "cat.png" })).toHaveAttribute(
      "src",
      "blob:http://localhost/preview",
    );
    act(() => uploads[0].progress(0.4));
    expect(screen.getByRole("progressbar", { name: "Uploading, 40%" })).toBeInTheDocument();
  });

  it("shows a link in a message of the other person, and never runs its markup", async () => {
    const { connections } = await renderChat();
    const text = 'see https://example.com <img src=x onerror="alert(1)">';

    act(() => connections[0].push({ type: "message", message: serverMessage("2", { text }) }));

    expect(screen.getByRole("link", { name: "https://example.com" })).toBeInTheDocument();
    expect(document.querySelector(".chat__log img")).toBeNull();
  });
});
