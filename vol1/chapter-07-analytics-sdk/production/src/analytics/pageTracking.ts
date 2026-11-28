/* NOT PART OF THE INTERVIEW: production version. */

type HistoryMethod = History["pushState"];

/**
 * Calls `onChange` each time the path of the page changes without a page
 * load, as it does in a single-page app. Returns a function that stops it.
 *
 * The browser has no event for `history.pushState`, so we wrap it, and
 * `replaceState` too. Back and forward fire `popstate`. A change of only the
 * query string or the hash is not a new page.
 */
export function watchPageChanges(onChange: () => void): () => void {
  let lastPath = location.pathname;
  let isWatching = true;

  const check = () => {
    try {
      if (isWatching && location.pathname !== lastPath) {
        lastPath = location.pathname;
        onChange();
      }
    } catch {
      // Our code must never break the navigation of the host app.
    }
  };

  function wrap(name: "pushState" | "replaceState"): () => void {
    const original = history[name];
    const wrapped: HistoryMethod = function (this: History, ...args) {
      // The real method runs first, and its errors go to the caller as before.
      original.apply(this, args);
      check();
    };
    history[name] = wrapped;

    return () => {
      // Another library may have wrapped our wrapper. Then we must leave it
      // in place, or we would remove their code too. `isWatching` turns ours off.
      if (history[name] === wrapped) {
        history[name] = original;
      }
    };
  }

  const unwrapPush = wrap("pushState");
  const unwrapReplace = wrap("replaceState");
  window.addEventListener("popstate", check);

  return () => {
    isWatching = false;
    unwrapPush();
    unwrapReplace();
    window.removeEventListener("popstate", check);
  };
}
