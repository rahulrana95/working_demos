/* NOT PART OF THE INTERVIEW. Small helpers that the tests share. */
import { act } from "@testing-library/react";
import type { FeedPage, Post } from "./types";

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
}

/** A promise that the test resolves by hand, to control the order of responses. */
export function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets every promise that is ready run, and lets React finish its updates. */
export async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

export function makePost(number: number, changes: Partial<Post> = {}): Post {
  return {
    id: `p${number}`,
    author: { id: "a1", name: `Author ${number}`, avatarUrl: "/avatar.svg" },
    text: `Text of post ${number}`,
    createdAt: "2026-11-28T09:30:00.000Z",
    likeCount: 5,
    likedByMe: false,
    commentCount: 2,
    ...changes,
  };
}

/** A page with the posts `from` to `to`. The cursor is the id of the last post. */
export function makePage(from: number, to: number, isLast = false): FeedPage {
  const posts = [];
  for (let number = from; number <= to; number++) {
    posts.push(makePost(number));
  }
  return { posts, nextCursor: isLast ? null : `p${to}` };
}

/**
 * jsdom has no IntersectionObserver. This one records what it watches, and
 * the test says when the element comes near the screen.
 */
export class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];

  elements = new Set<Element>();
  isDisconnected = false;

  constructor(
    private callback: IntersectionObserverCallback,
    public options: IntersectionObserverInit = {},
  ) {
    FakeIntersectionObserver.instances.push(this);
  }

  observe(element: Element) {
    this.elements.add(element);
  }

  unobserve(element: Element) {
    this.elements.delete(element);
  }

  disconnect() {
    this.isDisconnected = true;
    this.elements.clear();
  }

  /** Tells the observer that each watched element is, or is not, on screen. */
  trigger(isIntersecting: boolean, intersectionRatio = isIntersecting ? 1 : 0) {
    const entries = [...this.elements].map(
      (target) => ({ target, isIntersecting, intersectionRatio }) as IntersectionObserverEntry,
    );
    if (entries.length > 0) {
      this.callback(entries, this as unknown as IntersectionObserver);
    }
  }

  static install() {
    FakeIntersectionObserver.instances = [];
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  }

  /** The observers that still watch an element. */
  static get live(): FakeIntersectionObserver[] {
    return FakeIntersectionObserver.instances.filter((observer) => !observer.isDisconnected);
  }
}

/**
 * jsdom has no ResizeObserver and no layout. This one records what it
 * watches, and the test says how tall a row is.
 */
export class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];

  elements = new Set<Element>();

  constructor(private callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }

  observe(element: Element) {
    this.elements.add(element);
  }

  unobserve(element: Element) {
    this.elements.delete(element);
  }

  disconnect() {
    this.elements.clear();
  }

  static install() {
    FakeResizeObserver.instances = [];
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  }

  /** Every element that any observer watches now. */
  static get watched(): Element[] {
    return FakeResizeObserver.instances.flatMap((observer) => [...observer.elements]);
  }

  /** Gives each watched row a height (and a top), and reports it as a resize. */
  static resize(getRect: (row: HTMLElement) => { height: number; top?: number }) {
    for (const observer of FakeResizeObserver.instances) {
      const entries = [...observer.elements].map((target) => {
        const { height, top = 0 } = getRect(target as HTMLElement);
        const rect = { height, top, bottom: top + height } as DOMRect;
        vi.spyOn(target, "getBoundingClientRect").mockReturnValue(rect);
        return { target } as ResizeObserverEntry;
      });
      if (entries.length > 0) {
        observer.callback(entries, observer as unknown as ResizeObserver);
      }
    }
  }
}

/**
 * jsdom has no layout and does not scroll. This gives the page a scroll
 * position: `window.scrollTo` and `scrollBy` change it, and the feed list
 * reports its top from it, as if the list started at the top of the page.
 */
export function installFakeScroll() {
  let scrollY = 0;
  const realRect = Element.prototype.getBoundingClientRect;

  vi.stubGlobal(
    "scrollTo",
    vi.fn((_x: number, y: number) => {
      scrollY = y;
    }),
  );
  vi.stubGlobal(
    "scrollBy",
    vi.fn((_x: number, y: number) => {
      scrollY += y;
    }),
  );
  Object.defineProperty(window, "scrollY", { get: () => scrollY, configurable: true });
  Element.prototype.scrollIntoView = vi.fn(() => {
    scrollY = 0;
  });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    return this.getAttribute("role") === "feed"
      ? ({ top: -scrollY, height: 0 } as DOMRect)
      : realRect.call(this);
  });
}

/** Scrolls the fake page, and sends the scroll event that a browser would send. */
export function scrollPageTo(scrollY: number) {
  act(() => {
    window.scrollTo(0, scrollY);
    window.dispatchEvent(new Event("scroll"));
  });
}
