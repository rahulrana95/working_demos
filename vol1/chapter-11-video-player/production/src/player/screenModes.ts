/*
 * NOT PART OF THE INTERVIEW: production version.
 * Full screen and picture-in-picture. Both are missing in some browsers, and
 * both can be refused, so each hook says whether the mode is supported and
 * the button is drawn only then.
 *
 *   - Full screen: we put the whole player in full screen, not the <video>
 *     alone, so our own controls and captions stay on screen. Safari on
 *     iPhone cannot do that. It can only show the <video> in its own player,
 *     with `webkitEnterFullscreen`, so there we use that.
 *   - Picture-in-picture: missing in some browsers. A user can also switch it
 *     off, and the browser refuses it for a video that has not loaded.
 */
import { useEffect, useState } from "react";
import type { RefObject } from "react";

/** Safari on iPhone has these two instead of the standard API. */
interface VideoWithWebkitFullscreen extends HTMLVideoElement {
  webkitEnterFullscreen?: () => void;
}

export interface ScreenMode {
  isSupported: boolean;
  isActive: boolean;
  toggle: () => void;
}

/** A browser can refuse both modes. Then nothing changes, and that is all there is to do. */
function ignoreRefusal(request: Promise<unknown> | undefined): void {
  request?.catch(() => undefined);
}

export function useFullscreen(
  rootRef: RefObject<HTMLElement>,
  videoRef: RefObject<VideoWithWebkitFullscreen>,
): ScreenMode {
  const [isSupported, setIsSupported] = useState(false);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    // Read after the first drawing: on a server there is no document.
    setIsSupported(
      document.fullscreenEnabled === true ||
        typeof videoRef.current?.webkitEnterFullscreen === "function",
    );
    // The user can also leave full screen with Escape, so we listen for the change.
    const handleChange = () => setIsActive(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, [rootRef, videoRef]);

  function toggle() {
    const root = rootRef.current;
    if (document.fullscreenElement !== null && document.fullscreenElement !== undefined) {
      ignoreRefusal(document.exitFullscreen());
    } else if (document.fullscreenEnabled === true && root !== null) {
      ignoreRefusal(root.requestFullscreen());
    } else {
      videoRef.current?.webkitEnterFullscreen?.();
    }
  }

  return { isSupported, isActive, toggle };
}

export function usePictureInPicture(videoRef: RefObject<HTMLVideoElement>): ScreenMode {
  const [isSupported, setIsSupported] = useState(false);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (video === null) {
      return;
    }
    setIsSupported(
      document.pictureInPictureEnabled === true &&
        typeof video.requestPictureInPicture === "function",
    );
    const handleEnter = () => setIsActive(true);
    const handleLeave = () => setIsActive(false);
    video.addEventListener("enterpictureinpicture", handleEnter);
    video.addEventListener("leavepictureinpicture", handleLeave);
    return () => {
      video.removeEventListener("enterpictureinpicture", handleEnter);
      video.removeEventListener("leavepictureinpicture", handleLeave);
    };
  }, [videoRef]);

  function toggle() {
    const video = videoRef.current;
    if (document.pictureInPictureElement === video) {
      ignoreRefusal(document.exitPictureInPicture());
    } else {
      ignoreRefusal(video?.requestPictureInPicture());
    }
  }

  return { isSupported, isActive, toggle };
}
