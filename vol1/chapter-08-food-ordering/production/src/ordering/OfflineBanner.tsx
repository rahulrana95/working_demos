/*
 * NOT PART OF THE INTERVIEW: production version.
 * A line that says the browser seems to be offline. It is a hint for the
 * user. The pages keep sending their requests all the same.
 */
import { useOnlineHint } from "./useOnlineHint";

export function OfflineBanner({ text }: { text: string }) {
  const isOnline = useOnlineHint();
  // The element is always on the page, so a screen reader reads the text when it appears.
  return (
    <p className="offline-banner" role="status">
      {!isOnline && text}
    </p>
  );
}
