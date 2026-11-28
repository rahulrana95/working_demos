/*
 * NOT PART OF THE INTERVIEW: production version.
 * Says whether the browser thinks it is online. It is only a hint: "online"
 * can be a Wi-Fi with no internet, and "offline" can be wrong too. So we use
 * it for a message and never to decide whether to send a request.
 */
import { useEffect, useState } from "react";

export function useOnlineHint(): boolean {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return isOnline;
}
