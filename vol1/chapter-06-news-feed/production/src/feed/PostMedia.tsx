/*
 * NOT PART OF THE INTERVIEW: production version.
 * The picture or the video of a post, in a box that has the right shape
 * before the file loads.
 *
 * Why it holds at scale:
 *   1. `srcset` and `sizes`: a phone downloads the 480px file, not the
 *      1600px one. On a slow network that is most of the bytes of a feed.
 *   2. A video downloads nothing before it plays (`preload="none"`), and it
 *      plays only while at least half of it is on screen.
 */
import { useEffect, useRef, useState } from "react";
import type { FeedMessages } from "./messages";
import type { PostMedia as PostMediaData } from "./types";

/** "wide-480.jpg 480w, wide-960.jpg 960w": the list the browser picks from. */
export function buildSrcSet(sources: PostMediaData["sources"]): string | undefined {
  if (sources === undefined || sources.length === 0) {
    return undefined;
  }
  return sources.map((source) => `${source.url} ${source.width}w`).join(", ");
}

/** A video plays when this part of it is on screen. */
const VISIBLE_PART = 0.5;

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export interface PostMediaProps {
  media: PostMediaData;
  /** The `sizes` attribute: how wide the picture is on screen. */
  imageSizes: string;
  text: FeedMessages;
}

function PostVideo({ media, text }: Pick<PostMediaProps, "media" | "text">) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  /** True after the user pressed pause. We then never start the video for them. */
  const pausedByUser = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (video === null || typeof IntersectionObserver === "undefined") {
      return;
    }
    let isHalfVisible = false;

    const sync = () => {
      const canShow = isHalfVisible && document.visibilityState !== "hidden";

      if (!canShow) {
        video.pause();
      } else if (!pausedByUser.current && !prefersReducedMotion()) {
        // The browser may refuse to play. Then the play button is still there.
        video.play()?.catch(() => {});
      }
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        isHalfVisible = entry.isIntersecting && entry.intersectionRatio >= VISIBLE_PART;
        sync();
      },
      { threshold: VISIBLE_PART },
    );
    observer.observe(video);
    document.addEventListener("visibilitychange", sync);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      video.pause();
    };
  }, []);

  // The button works with reduced motion too: there the video never starts
  // by itself, but the user may start it.
  function handleButton() {
    const video = videoRef.current;
    if (video === null) {
      return;
    }

    pausedByUser.current = isPlaying;
    if (isPlaying) {
      video.pause();
    } else {
      video.play()?.catch(() => {});
    }
  }

  return (
    <>
      <video
        ref={videoRef}
        src={media.url}
        poster={media.posterUrl}
        aria-label={media.alt}
        // Muted, because a browser lets only a muted video start by itself.
        muted
        loop
        // Without this an iPhone opens the video full screen.
        playsInline
        preload="none"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
      {/* Always on screen, so the user can stop or start the video at any time. */}
      <button type="button" className="post__play" onClick={handleButton}>
        {isPlaying ? text.pauseVideo : text.playVideo}
      </button>
    </>
  );
}

export function PostMedia({ media, imageSizes, text }: PostMediaProps) {
  return (
    <div className="post__media" style={{ aspectRatio: `${media.width} / ${media.height}` }}>
      {media.kind === "video" ? (
        <PostVideo media={media} text={text} />
      ) : (
        <img
          src={media.url}
          srcSet={buildSrcSet(media.sources)}
          // `sizes` means something only next to `srcset`.
          sizes={media.sources === undefined ? undefined : imageSizes}
          alt={media.alt}
          loading="lazy"
          decoding="async"
        />
      )}
    </div>
  );
}
