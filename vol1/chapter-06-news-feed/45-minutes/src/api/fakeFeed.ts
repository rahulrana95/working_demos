/*
 * NOT PART OF THE INTERVIEW.
 * A fake server for the demo. It holds 2,000 posts and answers after a
 * random delay, like a real network. It can be told to fail.
 */
import type { FetchPageFn, LikeState, Post, SetLikeFn } from "../feed";

export const TOTAL_POSTS = 2000;
export const PAGE_SIZE = 10;

const MIN_DELAY_MS = 150;
const MAX_DELAY_MS = 700;

const AUTHORS = ["Asha Verma", "Ravi Kumar", "Meera Nair", "Imran Khan"];

const SENTENCES = [
  "Morning walk by the lake before the city wakes up.",
  "Tried a new recipe today and it worked on the first go.",
  "The train was on time. I do not know what to do with this feeling.",
  "Three chapters left in this book and I am reading slowly on purpose.",
  "Monsoon clouds over the hills this evening.",
  "Fixed a bug that was older than my laptop.",
  "Our street has a new tea stall and it is already the best one.",
  "Weekend plan: no plan.",
];

/** Some posts have no picture. The others have pictures of different shapes. */
const MEDIA = [
  undefined,
  { url: "/media/wide.svg", width: 1200, height: 800, alt: "A yellow sun over blue hills" },
  undefined,
  { url: "/media/square.svg", width: 800, height: 800, alt: "An orange sun over purple hills" },
  { url: "/media/tall.svg", width: 800, height: 1000, alt: "A pale sun over green hills" },
  undefined,
  { url: "/media/banner.svg", width: 1600, height: 900, alt: "A cream sun over red hills" },
];

const NEWEST_POST_TIME = Date.UTC(2026, 10, 28, 9, 30);
const MINUTES_BETWEEN_POSTS = 7;

/** Builds post number `index`. The same index always gives the same post. */
export function createPost(index: number): Post {
  const authorIndex = index % AUTHORS.length;
  const sentenceCount = 1 + (index % 3);
  const sentences = [];
  for (let step = 0; step < sentenceCount; step++) {
    sentences.push(SENTENCES[(index * 3 + step * 5) % SENTENCES.length]);
  }

  return {
    id: `post-${index + 1}`,
    author: {
      id: `author-${authorIndex + 1}`,
      name: AUTHORS[authorIndex],
      avatarUrl: `/media/avatar-${authorIndex + 1}.svg`,
    },
    text: sentences.join(" "),
    media: MEDIA[index % MEDIA.length],
    createdAt: new Date(NEWEST_POST_TIME - index * MINUTES_BETWEEN_POSTS * 60_000).toISOString(),
    likeCount: (index * 37) % 500,
    likedByMe: false,
    commentCount: (index * 11) % 40,
  };
}

export interface FakeFeedOptions {
  /** Return true to make the next request fail. */
  shouldFail: () => boolean;
  /** Called once for every request that reaches the "server". */
  onRequest: (description: string) => void;
  /** Called once for every page that the "server" sends back. */
  onPage: (posts: Post[]) => void;
}

/** Waits a random time, then runs `answer`. Stops waiting when the signal is aborted. */
function afterDelay<T>(signal: AbortSignal, answer: () => T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const delayMs = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);

    const timerId = setTimeout(() => {
      try {
        resolve(answer());
      } catch (error) {
        reject(error);
      }
    }, delayMs);

    signal.addEventListener("abort", () => {
      clearTimeout(timerId);
      reject(new DOMException("The request was cancelled", "AbortError"));
    });
  });
}

export function createFakeFeed({ shouldFail, onRequest, onPage }: FakeFeedOptions): {
  fetchPage: FetchPageFn;
  setLike: SetLikeFn;
} {
  const posts = Array.from({ length: TOTAL_POSTS }, (_, index) => createPost(index));
  const likes = new Map<string, LikeState>();

  function failIfAsked() {
    if (shouldFail()) {
      throw new Error("The server did not respond");
    }
  }

  const fetchPage: FetchPageFn = (cursor, signal) => {
    onRequest(`page after ${cursor ?? "the start"}`);

    return afterDelay(signal, () => {
      failIfAsked();

      // The cursor is the id of the last post of the page before.
      const start = cursor === null ? 0 : posts.findIndex((post) => post.id === cursor) + 1;
      const page = posts
        .slice(start, start + PAGE_SIZE)
        .map((post) => ({ ...post, ...likes.get(post.id) }));
      const isLastPage = start + PAGE_SIZE >= posts.length;

      onPage(page);
      return { posts: page, nextCursor: isLastPage ? null : page[page.length - 1].id };
    });
  };

  const setLike: SetLikeFn = (postId, liked, signal) => {
    onRequest(`${liked ? "like" : "unlike"} ${postId}`);

    return afterDelay(signal, () => {
      failIfAsked();

      const post = posts.find((candidate) => candidate.id === postId);
      if (post === undefined) {
        throw new Error("No such post");
      }

      const saved = { likedByMe: liked, likeCount: post.likeCount + (liked ? 1 : 0) };
      likes.set(postId, saved);
      return saved;
    });
  };

  return { fetchPage, setLike };
}
