/* NOT PART OF THE INTERVIEW. Tests of the conversation list on screen. */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ConversationList } from "./ConversationList";
import { defaultMessages } from "./messages";
import type { ChatMessages } from "./messages";
import { conversation } from "./testUtils";
import type { UseConversationsReturn } from "./useConversations";

const READY: UseConversationsReturn = {
  status: "ready",
  unreadTotal: 3,
  conversations: [
    conversation("c1", {
      title: "Ravi",
      lastMessage: { senderId: "ravi", text: "Lunch at one?", createdAt: 2 },
    }),
    conversation("c2", {
      title: "Meera",
      unreadCount: 3,
      lastMessage: { senderId: "asha", text: "On my way", createdAt: 1 },
    }),
    conversation("c3", { title: "Kabir" }),
  ],
};

function renderList(list = READY, text: ChatMessages = defaultMessages, locale = "en") {
  const onOpen = vi.fn();
  render(
    <ConversationList
      list={list}
      openConversationId="c1"
      onOpen={onOpen}
      currentUserId="asha"
      text={text}
      locale={locale}
    />,
  );
  return { onOpen };
}

describe("ConversationList", () => {
  it("is a navigation region with a name, and has one button for each conversation", () => {
    renderList();

    const nav = screen.getByRole("navigation", { name: "Conversations" });
    expect(within(nav).getAllByRole("button")).toHaveLength(3);
  });

  it("shows the name, the last message and the unread count as text", () => {
    renderList();

    const meera = screen.getByRole("button", { name: /Meera/ });
    expect(meera).toHaveTextContent("You: On my way");
    expect(meera).toHaveTextContent("3 unread messages");
    expect(screen.getByRole("button", { name: /Ravi/ })).toHaveTextContent("Lunch at one?");
    expect(screen.getByRole("button", { name: /Ravi/ })).not.toHaveTextContent("unread");
    expect(screen.getByRole("button", { name: /Kabir/ })).toHaveTextContent("No messages yet");
  });

  it("uses the plural form of the language for the count", () => {
    const one = {
      ...READY,
      conversations: [conversation("c1", { title: "Ravi", unreadCount: 1 })],
    };
    renderList(one);

    expect(screen.getByRole("button", { name: /Ravi/ })).toHaveTextContent("1 unread message");
    expect(screen.getByRole("button", { name: /Ravi/ })).not.toHaveTextContent("unread messages");
  });

  it("marks the open conversation for screen readers", () => {
    renderList();

    expect(screen.getByRole("button", { name: /Ravi/ })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: /Meera/ })).not.toHaveAttribute("aria-current");
  });

  it("opens a conversation on a click", () => {
    const { onOpen } = renderList();

    fireEvent.click(screen.getByRole("button", { name: /Meera/ }));

    expect(onOpen).toHaveBeenCalledWith("c2");
  });

  it("says Image for a last message that is only an image", () => {
    const image = {
      senderId: "ravi",
      text: "",
      createdAt: 1,
      attachment: { url: "https://x/a.png", name: "a.png" },
    };
    renderList({
      ...READY,
      conversations: [conversation("c1", { title: "Ravi", lastMessage: image })],
    });

    expect(screen.getByRole("button", { name: /Ravi/ })).toHaveTextContent("Image");
  });

  it("draws a last message with markup as text", () => {
    const text = '<img src=x onerror="alert(1)">';
    const list = {
      ...READY,
      conversations: [
        conversation("c1", {
          title: "Ravi",
          lastMessage: { senderId: "ravi", text, createdAt: 1 },
        }),
      ],
    };
    renderList(list);

    expect(screen.getByText(text)).toBeInTheDocument();
    expect(document.querySelector("nav img")).toBeNull();
  });

  it("says that the list is loading, and that it could not be loaded", () => {
    renderList({ status: "loading", unreadTotal: 0, conversations: [] });
    expect(screen.getByText("Loading…")).toBeInTheDocument();

    renderList({ status: "error", unreadTotal: 0, conversations: [] });
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load the conversations.");
  });

  it("takes every text from `text`, with all the plural forms of Arabic", () => {
    const text: ChatMessages = {
      ...defaultMessages,
      conversations: "المحادثات",
      you: "أنت",
      unread: {
        zero: "0",
        one: "واحدة",
        two: "اثنتان",
        few: "{count} قليل",
        many: "{count} كثير",
        other: "{count} أخرى",
      },
    };
    const list = {
      ...READY,
      conversations: [2, 3, 11, 100].map((unreadCount) =>
        conversation(`c${unreadCount}`, { title: `T${unreadCount}`, unreadCount }),
      ),
    };
    renderList(list, text, "ar-EG");

    expect(screen.getByRole("navigation", { name: "المحادثات" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /T2 / })).toHaveTextContent("اثنتان");
    expect(screen.getByRole("button", { name: /T3 / })).toHaveTextContent("٣ قليل");
    expect(screen.getByRole("button", { name: /T11 / })).toHaveTextContent("١١ كثير");
    expect(screen.getByRole("button", { name: /T100 / })).toHaveTextContent("١٠٠ أخرى");
  });
});
