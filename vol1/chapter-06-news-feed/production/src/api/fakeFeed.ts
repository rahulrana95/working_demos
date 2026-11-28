/*
 * NOT PART OF THE INTERVIEW: production version.
 * A fake server for the demo. It holds 2,000 posts and answers after a
 * random delay, like a real network. It can be told to fail. It also has a
 * fake live connection that can be told to drop.
 */
import type {
  FeedStreamEvent,
  FetchNewerFn,
  FetchPageFn,
  LikeState,
  Post,
  PostMedia,
  SetLikeFn,
  SubscribeFn,
} from "../feed";

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

/**
 * The demo has one file per picture. A real image server would send a
 * smaller file for a smaller width. Here the address differs and the file
 * does not, which is enough to see which one the browser asks for.
 */
function image(name: string, width: number, height: number, alt: string): PostMedia {
  const url = `/media/${name}.svg`;
  const sources = [480, 960, 1600].map((sourceWidth) => ({
    url: `${url}?w=${sourceWidth}`,
    width: sourceWidth,
  }));
  return { url, width, height, alt, sources };
}

/** Some posts have no media. The others have pictures of different shapes, or a video. */
const MEDIA: (PostMedia | undefined)[] = [
  undefined,
  image("wide", 1200, 800, "A yellow sun over blue hills"),
  undefined,
  image("square", 800, 800, "An orange sun over purple hills"),
  {
    kind: "video",
    url: "/media/clip.mp4",
    posterUrl: "/media/clip-poster.jpg",
    width: 320,
    height: 180,
    alt: "A test pattern with a moving bar",
  },
  image("tall", 800, 1000, "A pale sun over green hills"),
  undefined,
  image("banner", 1600, 900, "A cream sun over red hills"),
];

/** This post is sent with no author, to show that one bad post does not break the feed. */
const BROKEN_POST_INDEX = 7;
const STREAM_DELAY_MS = 200;

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

  const author = {
    id: `author-${authorIndex + 1}`,
    name: AUTHORS[authorIndex],
    avatarUrl: `/media/avatar-${authorIndex + 1}.svg`,
  };

  return {
    id: `post-${index + 1}`,
    // The cast is the point: the server broke the contract for this post.
    author: index === BROKEN_POST_INDEX ? (null as unknown as Post["author"]) : author,
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
  /** Return true to make the live connection drop, and stay down. */
  isStreamDown: () => boolean;
  /** Called with the number of open live connections when it changes. */
  onConnections: (count: number) => void;
}

/** Waits a random time, then runs `answer`. Stops waiting when the signal is aborted. */
function afterDelay<T>(signal: AbortSignal, answer: () => T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("The request was cancelled", "AbortError"));
      return;
    }

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

export interface FakeFeed {
  fetchPage: FetchPageFn;
  setLike: SetLikeFn;
  fetchNewer: FetchNewerFn;
  subscribe: SubscribeFn;
  /** Adds one new post at the top of the feed on the "server", and sends it to the open connections. */
  publish: () => void;
  /** Tells every open connection that it dropped. */
  dropConnections: () => void;
  getPost: (postId: string) => Post | undefined;
}

export function createFakeFeed({
  shouldFail,
  onRequest,
  onPage,
  isStreamDown,
  onConnections,
}: FakeFeedOptions): FakeFeed {
  const listeners = new Set<(event: FeedStreamEvent) => void>();
  const posts = Array.from({ length: TOTAL_POSTS }, (_, index) => createPost(index));
  const likes = new Map<string, LikeState>();
  /** The answers the server already gave, by idempotency key. */
  const answersByKey = new Map<string, LikeState>();
  let publishedCount = 0;

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

  const setLike: SetLikeFn = (postId, liked, signal, idempotencyKey) => {
    onRequest(`${liked ? "like" : "unlike"} ${postId}, key ${idempotencyKey.slice(0, 8)}`);

    return afterDelay(signal, () => {
      failIfAsked();

      // The server has seen this key: it answers again and saves nothing twice.
      const earlierAnswer = answersByKey.get(idempotencyKey);
      if (earlierAnswer !== undefined) {
        return earlierAnswer;
      }

      const post = posts.find((candidate) => candidate.id === postId);
      if (post === undefined) {
        throw new Error("No such post");
      }

      const saved = { likedByMe: liked, likeCount: post.likeCount + (liked ? 1 : 0) };
      likes.set(postId, saved);
      answersByKey.set(idempotencyKey, saved);
      return saved;
    });
  };

  const fetchNewer: FetchNewerFn = (sinceId, signal) => {
    onRequest(`posts newer than ${sinceId ?? "nothing"}`);

    return afterDelay(signal, () => {
      failIfAsked();

      const sinceIndex = sinceId === null ? -1 : posts.findIndex((post) => post.id === sinceId);
      return sinceIndex === -1 ? [] : posts.slice(0, sinceIndex);
    });
  };

  function publish() {
    publishedCount += 1;
    const post = {
      ...createPost(publishedCount),
      id: `new-${publishedCount}`,
      text: `New post ${publishedCount}.`,
      media: undefined,
      createdAt: new Date().toISOString(),
      likeCount: 0,
      commentCount: 0,
    };
    posts.unshift(post);
    for (const listener of listeners) {
      listener({ type: "post", post });
    }
  }

  function dropConnections() {
    // Each listener unsubscribes when it hears "closed", so we walk a copy.
    for (const listener of [...listeners]) {
      listener({ type: "closed" });
    }
  }

  const subscribe: SubscribeFn = (onEvent) => {
    onRequest("open the live connection");

    // Like a real connection, it answers a moment later: open, or closed.
    const timerId = setTimeout(() => {
      if (isStreamDown()) {
        onEvent({ type: "closed" });
        return;
      }
      listeners.add(onEvent);
      onConnections(listeners.size);
      onEvent({ type: "open" });
    }, STREAM_DELAY_MS);

    return () => {
      clearTimeout(timerId);
      listeners.delete(onEvent);
      onConnections(listeners.size);
    };
  };

  return {
    fetchPage,
    setLike,
    fetchNewer,
    subscribe,
    publish,
    dropConnections,
    getPost: (postId) => posts.find((post) => post.id === postId),
  };
}
