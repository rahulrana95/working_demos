/*
 * NOT PART OF THE INTERVIEW.
 * The demo page. It shows the feed and a small panel with what you cannot
 * see: the requests, the pages, the posts in memory and the size of the DOM.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createFakeFeed } from "./api/fakeFeed";
import { Feed } from "./feed";

const COUNT_EVERY_MS = 500;

/** Counts the elements on the page again and again, because scrolling changes it. */
function useDomCounts(): { nodes: number; articles: number } {
  const [counts, setCounts] = useState({ nodes: 0, articles: 0 });

  useEffect(() => {
    const timerId = setInterval(() => {
      setCounts({
        nodes: document.querySelectorAll("*").length,
        articles: document.querySelectorAll("article").length,
      });
    }, COUNT_EVERY_MS);

    return () => clearInterval(timerId);
  }, []);

  return counts;
}

export function App() {
  const [isServerFailing, setIsServerFailing] = useState(false);
  const [requestCount, setRequestCount] = useState(0);
  const [lastRequest, setLastRequest] = useState("none yet");
  const [pageCount, setPageCount] = useState(0);
  const [postCount, setPostCount] = useState(0);
  const domCounts = useDomCounts();

  // The fake server is created once. It reads the checkbox value from a
  // ref, so ticking the checkbox does not create a new server.
  const isServerFailingRef = useRef(isServerFailing);
  useEffect(() => {
    isServerFailingRef.current = isServerFailing;
  }, [isServerFailing]);

  const server = useMemo(
    () =>
      createFakeFeed({
        shouldFail: () => isServerFailingRef.current,
        onRequest: (description) => {
          setRequestCount((count) => count + 1);
          setLastRequest(description);
        },
        onPage: (posts) => {
          setPageCount((count) => count + 1);
          // This feed keeps every post it was sent, so the two numbers are the same.
          setPostCount((count) => count + posts.length);
        },
      }),
    [],
  );

  return (
    <main className="page">
      <h1>Chapter 6: News feed</h1>
      <p className="page__intro">
        Scroll down, or press Tab to enter the feed and then <kbd>Page Down</kbd> and{" "}
        <kbd>Page Up</kbd> to move from post to post.
      </p>

      <section className="panel" aria-label="What is happening">
        <label className="panel__toggle">
          <input
            type="checkbox"
            checked={isServerFailing}
            onChange={(event) => setIsServerFailing(event.target.checked)}
          />
          Make the server fail
        </label>
        <dl className="panel__numbers">
          <dt>Requests sent</dt>
          <dd data-testid="requests">{requestCount}</dd>
          <dt>Pages loaded</dt>
          <dd data-testid="pages">{pageCount}</dd>
          <dt>Posts in memory</dt>
          <dd data-testid="posts">{postCount}</dd>
          <dt>Posts in the DOM</dt>
          <dd data-testid="articles">{domCounts.articles}</dd>
          <dt>DOM nodes</dt>
          <dd data-testid="nodes">{domCounts.nodes}</dd>
        </dl>
        <p className="panel__hint">Last request: {lastRequest}</p>
      </section>

      <Feed label="News feed" fetchPage={server.fetchPage} setLike={server.setLike} />
    </main>
  );
}
