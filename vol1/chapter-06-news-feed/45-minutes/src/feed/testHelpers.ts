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
