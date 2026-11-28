/*
 * PART OF THE INTERVIEW: yes (about 7 minutes).
 * Write it after the hooks. It holds no logic: it draws one post.
 * The staff-level addition: `observeRow`, so the virtual list can measure
 * the height of the post.
 *
 * Why it holds at scale:
 *   1. The image sits in a box that already has the right shape, so the
 *      posts below do not jump when the image arrives (no layout shift).
 *   2. `loading="lazy"`: the browser fetches an image only when it is near
 *      the screen. A feed of 1,000 posts does not download 1,000 images.
 *   3. `memo`: a like on one post does not draw the other posts again.
 *      A scroll that shows the same posts draws nothing again either.
 */
import { memo, useEffect, useRef } from "react";
import type { Post } from "./types";

export interface PostCardProps {
  post: Post;
  /** The place of the post in the feed. 1 is the first post. */
  position: number;
  /** How many posts the feed has, or -1 while more can be loaded. */
  setSize: number;
  onToggleLike: (post: Post) => void;
  /** Starts measuring the post. Returns the function that stops it. */
  observeRow: (row: HTMLElement) => () => void;
}

function PostCardInner({ post, position, setSize, onToggleLike, observeRow }: PostCardProps) {
  const authorId = `post-${post.id}-author`;

  // Tell the virtual list to measure this post while it is on the page.
  const rowRef = useRef<HTMLElement>(null);
  useEffect(() => (rowRef.current === null ? undefined : observeRow(rowRef.current)), [observeRow]);

  return (
    <article
      ref={rowRef}
      className="post"
      data-post-id={post.id}
      // Focusable, so Page Down and Page Up can move focus from post to post.
      tabIndex={0}
      aria-posinset={position}
      aria-setsize={setSize}
      aria-labelledby={authorId}
    >
      <h2 className="post__author" id={authorId}>
        {post.author.name}
      </h2>

      {/* React writes this as text, never as HTML. A post cannot inject a script. */}
      <p className="post__text">{post.text}</p>

      {post.media !== undefined && (
        <div
          className="post__media"
          style={{ aspectRatio: `${post.media.width} / ${post.media.height}` }}
        >
          <img src={post.media.url} alt={post.media.alt} loading="lazy" decoding="async" />
        </div>
      )}

      <footer className="post__footer">
        <button
          type="button"
          className="post__like"
          aria-pressed={post.likedByMe}
          onClick={() => onToggleLike(post)}
        >
          Like
        </button>
        <span>Likes: {post.likeCount}</span>
        <span>Comments: {post.commentCount}</span>
      </footer>
    </article>
  );
}

export const PostCard = memo(PostCardInner);
