/* NOT PART OF THE INTERVIEW. Tests of the title badge and of the notifications. */
import { renderHook } from "@testing-library/react";
import {
  askForNotifications,
  notificationState,
  showNotification,
  useTitleBadge,
} from "./attention";

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

/** Puts a fake `Notification` in the page. Returns the notifications that were made. */
function stubNotification(
  permission: NotificationPermission,
  answer: NotificationPermission = permission,
) {
  const shown: { title: string; tag?: string; close: () => void; onclick?: () => void }[] = [];
  class FakeNotification {
    static permission = permission;
    static requestPermission = vi.fn(async () => {
      FakeNotification.permission = answer;
      return answer;
    });
    close = vi.fn();
    onclick?: () => void;
    constructor(
      public title: string,
      options: { tag?: string } = {},
    ) {
      shown.push(Object.assign(this, { tag: options.tag }));
    }
  }
  vi.stubGlobal("Notification", FakeNotification);
  return { shown, FakeNotification };
}

afterEach(() => {
  vi.unstubAllGlobals();
  setVisibility("visible");
});

describe("useTitleBadge", () => {
  beforeEach(() => {
    document.title = "Chat";
  });

  it("puts the unread count in front of the title, and takes it away at zero", () => {
    const { rerender } = renderHook(({ count }) => useTitleBadge(count), {
      initialProps: { count: 0 },
    });
    expect(document.title).toBe("Chat");

    rerender({ count: 3 });
    expect(document.title).toBe("(3) Chat");

    rerender({ count: 12 });
    expect(document.title).toBe("(12) Chat");

    rerender({ count: 0 });
    expect(document.title).toBe("Chat");
  });

  it("gives the title back when the component is removed", () => {
    const { unmount } = renderHook(() => useTitleBadge(5));
    expect(document.title).toBe("(5) Chat");

    unmount();

    expect(document.title).toBe("Chat");
  });
});

describe("notifications", () => {
  it("says unsupported in a browser without notifications, and shows nothing", async () => {
    vi.stubGlobal("Notification", undefined);
    setVisibility("hidden");

    expect(notificationState()).toBe("unsupported");
    expect(await askForNotifications()).toBe("unsupported");
    expect(showNotification("New message from Ravi", "c1")).toBe(false);
  });

  it("asks the browser only when the user has not answered before", async () => {
    const fresh = stubNotification("default", "granted");
    expect(await askForNotifications()).toBe("granted");
    expect(fresh.FakeNotification.requestPermission).toHaveBeenCalledTimes(1);

    const blocked = stubNotification("denied");
    expect(await askForNotifications()).toBe("denied");
    expect(blocked.FakeNotification.requestPermission).not.toHaveBeenCalled();
  });

  it("shows nothing while the user can see the page", () => {
    const { shown } = stubNotification("granted");
    setVisibility("visible");

    expect(showNotification("New message from Ravi", "c1")).toBe(false);
    expect(shown).toHaveLength(0);
  });

  it("shows nothing when the user did not allow it", () => {
    const { shown } = stubNotification("default");
    setVisibility("hidden");

    expect(showNotification("New message from Ravi", "c1")).toBe(false);
    expect(shown).toHaveLength(0);
  });

  it("shows a notification with the conversation as tag when the page is hidden and the user allowed it", () => {
    const { shown } = stubNotification("granted");
    setVisibility("hidden");

    expect(showNotification("New message from Ravi", "c1")).toBe(true);
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ title: "New message from Ravi", tag: "c1" });
  });

  it("brings the window to the front and closes the notification on a click", () => {
    const { shown } = stubNotification("granted");
    setVisibility("hidden");
    const focus = vi.spyOn(window, "focus").mockImplementation(() => {});
    showNotification("New message from Ravi", "c1");

    shown[0].onclick?.();

    expect(focus).toHaveBeenCalled();
    expect(shown[0].close).toHaveBeenCalled();
  });

  it("does not throw on a phone, where making a notification throws", () => {
    class ThrowingNotification {
      static permission = "granted";
      constructor() {
        throw new TypeError("Illegal constructor");
      }
    }
    vi.stubGlobal("Notification", ThrowingNotification);
    setVisibility("hidden");

    expect(showNotification("New message from Ravi", "c1")).toBe(false);
  });
});
