/*
 * NOT PART OF THE INTERVIEW: production version.
 * The demo page. It shows the feed, switches that break the server and the
 * live connection, and a panel with what you cannot see: the requests, the
 * posts in memory, the size of the DOM and the last events.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createFakeFeed } from "./api/fakeFeed";
import { Feed, clearCachedPage, createFeedSession } from "./feed";
import type { FeedEvent, Post } from "./feed";

const COUNT_EVERY_MS = 500;
const SHOWN_EVENTS = 6;
/** Small, so you can see pages being dropped after a short scroll. The default is 500. */
const MAX_POSTS = 100;
/** A real app puts the id of the user in the key. */
const CACHE_KEY = "chapter-06-feed:demo-user";

/** The page keeps the session. The feed is removed and comes back; this stays. */
const session = createFeedSession();

function getPostHref(post: Post): string {
  return `#/post/${post.id}`;
}

/** Counts again and again, because scrolling changes the numbers. */
function useCounts(): { nodes: number; articles: number; posts: number; ids: number } {
  const [counts, setCounts] = useState({ nodes: 0, articles: 0, posts: 0, ids: 0 });

  useEffect(() => {
    const timerId = setInterval(() => {
      setCounts({
        nodes: document.querySelectorAll("*").length,
        articles: document.querySelectorAll("article").length,
        posts: Object.keys(session.state?.postsById ?? {}).length,
        ids: session.state?.order.length ?? 0,
      });
    }, COUNT_EVERY_MS);

    return () => clearInterval(timerId);
  }, []);

  return counts;
}

/** The id of the post in the address, for example "#/post/post-12", or `null`. */
function usePostIdFromHash(): string | null {
  const [hash, setHash] = useState(window.location.hash);

  useEffect(() => {
    const handleHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  return hash.startsWith("#/post/") ? hash.slice("#/post/".length) : null;
}

export function App() {
  const [isServerFailing, setIsServerFailing] = useState(false);
  const [isStreamDown, setIsStreamDown] = useState(false);
  const [requestCount, setRequestCount] = useState(0);
  const [lastRequest, setLastRequest] = useState("none yet");
  const [connectionCount, setConnectionCount] = useState(0);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const counts = useCounts();
  const openPostId = usePostIdFromHash();

  // The fake server is created once. It reads the switches from a ref, so
  // a switch does not create a new server.
  const switches = useRef({ isServerFailing, isStreamDown });
  useEffect(() => {
    switches.current = { isServerFailing, isStreamDown };
  }, [isServerFailing, isStreamDown]);

  const server = useMemo(
    () =>
      createFakeFeed({
        shouldFail: () => switches.current.isServerFailing,
        isStreamDown: () => switches.current.isStreamDown,
        onRequest: (description) => {
          setRequestCount((count) => count + 1);
          setLastRequest(description);
        },
        onPage: () => {},
        onConnections: setConnectionCount,
      }),
    [],
  );

  // useMemo is not needed for a function that uses nothing from the render:
  // the state setter never changes.
  const [handleEvent] = useState(
    () => (event: FeedEvent) =>
      setEvents((previous) => [event, ...previous].slice(0, SHOWN_EVENTS)),
  );

  // The feed puts the scroll position back itself. Without this line the
  // browser would also try, before the posts are on the page.
  useEffect(() => {
    window.history.scrollRestoration = "manual";
  }, []);

  // The page of a post starts at its top.
  useEffect(() => {
    if (openPostId !== null) {
      window.scrollTo(0, 0);
    }
  }, [openPostId]);

  function handleStreamSwitch(isDown: boolean) {
    setIsStreamDown(isDown);
    if (isDown) {
      // The ref is read by the fake server when the feed tries to reconnect.
      switches.current.isStreamDown = true;
      server.dropConnections();
    }
  }

  const openPost = openPostId === null ? undefined : server.getPost(openPostId);

  return (
    <main className="page">
      <h1>Chapter 6: News feed</h1>

      <section className="panel" aria-label="What is happening">
        <label className="panel__toggle">
          <input
            type="checkbox"
            checked={isServerFailing}
            onChange={(event) => setIsServerFailing(event.target.checked)}
          />
          Make the server fail
        </label>
        <label className="panel__toggle">
          <input
            type="checkbox"
            checked={isStreamDown}
            onChange={(event) => handleStreamSwitch(event.target.checked)}
          />
          Drop the live connection
        </label>
        <button type="button" className="panel__button" onClick={server.publish}>
          Publish a new post
        </button>
        <button type="button" className="panel__button" onClick={() => clearCachedPage(CACHE_KEY)}>
          Forget the saved page
        </button>
        <dl className="panel__numbers">
          <dt>Requests</dt>
          <dd data-testid="requests">{requestCount}</dd>
          <dt>Live connections</dt>
          <dd data-testid="connections">{connectionCount}</dd>
          <dt>Posts in memory</dt>
          <dd data-testid="posts">{counts.posts}</dd>
          <dt>Post ids</dt>
          <dd data-testid="ids">{counts.ids}</dd>
          <dt>Posts in the DOM</dt>
          <dd data-testid="articles">{counts.articles}</dd>
          <dt>DOM nodes</dt>
          <dd data-testid="nodes">{counts.nodes}</dd>
        </dl>
        <p className="panel__hint">Last request: {lastRequest}</p>
        <ol className="panel__log" aria-label="Last events">
          {events.map((event, index) => (
            <li key={index}>{JSON.stringify(event)}</li>
          ))}
        </ol>
      </section>

      {openPostId === null ? (
        <>
          <p className="page__intro">
            Scroll down, or press Tab to enter the feed and then <kbd>Page Down</kbd> and{" "}
            <kbd>Page Up</kbd> to move from post to post. The date of a post opens its page.
          </p>
          <Feed
            label="News feed"
            fetchPage={server.fetchPage}
            setLike={server.setLike}
            fetchNewer={server.fetchNewer}
            subscribe={server.subscribe}
            session={session}
            cacheKey={CACHE_KEY}
            maxPosts={MAX_POSTS}
            postHref={getPostHref}
            onEvent={handleEvent}
          />
        </>
      ) : (
        <section className="detail" aria-label="One post">
          <a className="detail__back" href="#/">
            Back to the feed
          </a>
          <div className="detail__post">
            <h2>{openPost?.author?.name ?? "This post cannot be shown"}</h2>
            <p>{openPost?.text}</p>
          </div>
        </section>
      )}
    </main>
  );
}
