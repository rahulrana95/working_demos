/*
 * NOT PART OF THE INTERVIEW: production version.
 * Draws one post. The production version adds an error boundary around the
 * inside of the post, video and responsive images (`PostMedia`), and the
 * placeholder for a post whose data was dropped to save memory.
 *
 * Why it holds at scale:
 *   1. The media sits in a box that already has the right shape, so the
 *      posts below do not jump when it arrives (no layout shift).
 *   2. `memo`: a like on one post, or a scroll, does not draw the other
 *      posts again.
 *   3. One broken post shows a message. It cannot blank the feed.
 */
import { memo, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { FeedMessages } from "./messages";
import { PostErrorBoundary } from "./PostErrorBoundary";
import { PostMedia } from "./PostMedia";
import type { Post } from "./types";

/** What a custom post gets, next to the post itself. */
export interface RenderPostHelpers {
  /** Put this id on the element that names the post, for screen readers. */
  labelId: string;
  toggleLike: () => void;
  likeFailed: boolean;
}

export interface PostCardProps {
  post: Post;
  /** The place of the post in the feed. 1 is the first post. */
  position: number;
  /** How many posts the feed has, or -1 while more can be loaded. */
  setSize: number;
  likeFailed: boolean;
  text: FeedMessages;
  imageSizes: string;
  onToggleLike: (post: Post) => void;
  /** Starts measuring and watching the post. Returns the function that stops it. */
  observeRow: (row: HTMLElement) => () => void;
  /** Called with the id of a post that could not be drawn. */
  onRenderError: (postId: string) => void;
  postHref?: (post: Post) => string;
  renderPost?: (post: Post, helpers: RenderPostHelpers) => ReactNode;
}

type PostContentProps = Omit<
  PostCardProps,
  "position" | "setSize" | "observeRow" | "onRenderError"
> & { labelId: string };

/**
 * The inside of a post. It is a component of its own, so an error in it, or
 * in the page's `renderPost`, is caught by the boundary around it.
 */
function PostContent({
  post,
  labelId,
  likeFailed,
  text,
  imageSizes,
  onToggleLike,
  postHref,
  renderPost,
}: PostContentProps) {
  if (renderPost !== undefined) {
    return renderPost(post, { labelId, likeFailed, toggleLike: () => onToggleLike(post) });
  }

  const date = <time dateTime={post.createdAt}>{text.formatDate(post.createdAt)}</time>;

  return (
    <>
      <header className="post__header">
        {/* The name is next to it, so the picture needs no text of its own. */}
        <img
          className="post__avatar"
          src={post.author.avatarUrl}
          alt=""
          width={40}
          height={40}
          loading="lazy"
          decoding="async"
        />
        <h2 className="post__author" id={labelId}>
          {post.author.name}
        </h2>
        <span className="post__time">
          {postHref === undefined ? date : <a href={postHref(post)}>{date}</a>}
        </span>
      </header>

      {/* React writes this as text, never as HTML. A post cannot inject a script. */}
      <p className="post__text">{post.text}</p>

      {post.media !== undefined && (
        <PostMedia media={post.media} imageSizes={imageSizes} text={text} />
      )}

      <footer className="post__footer">
        <button
          type="button"
          className="post__like"
          aria-pressed={post.likedByMe}
          onClick={() => onToggleLike(post)}
        >
          {text.like}
        </button>
        <span>{text.likeCount(post.likeCount)}</span>
        <span>{text.commentCount(post.commentCount)}</span>
      </footer>

      {likeFailed && (
        <p className="post__error" role="alert">
          {text.likeFailed}
        </p>
      )}
    </>
  );
}

function PostCardInner({
  position,
  setSize,
  observeRow,
  onRenderError,
  ...contentProps
}: PostCardProps) {
  const { post, text } = contentProps;
  const labelId = `post-${post.id}-author`;

  // Measure and watch this post while it is on the page.
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
      aria-labelledby={labelId}
    >
      <PostErrorBoundary
        postId={post.id}
        onError={onRenderError}
        fallback={
          <p className="post__error" id={labelId}>
            {text.postBroken}
          </p>
        }
      >
        <PostContent {...contentProps} labelId={labelId} />
      </PostErrorBoundary>
    </article>
  );
}

export const PostCard = memo(PostCardInner);

export interface PostPlaceholderProps {
  postId: string;
  position: number;
  setSize: number;
  /** The height the post had when it was last drawn, or the estimate. */
  height: number;
  /** True when the page of this post could not be fetched again. */
  hasFailed: boolean;
  text: FeedMessages;
  onRetry: (postId: string, isRetry: boolean) => void;
}

/**
 * Stands in for a post whose data was dropped to save memory, while its
 * page is fetched again. It has the height of the post, so nothing moves.
 */
export function PostPlaceholder({
  postId,
  position,
  setSize,
  height,
  hasFailed,
  text,
  onRetry,
}: PostPlaceholderProps) {
  return (
    <article
      className="post post--placeholder"
      data-post-id={postId}
      tabIndex={0}
      aria-posinset={position}
      aria-setsize={setSize}
      aria-label={text.postLoading}
      aria-busy={!hasFailed}
      style={{ blockSize: height }}
    >
      {hasFailed && (
        <p className="post__error" role="alert">
          {text.loadMoreFailed}{" "}
          <button type="button" className="post__retry" onClick={() => onRetry(postId, true)}>
            {text.retry}
          </button>
        </p>
      )}
    </article>
  );
}
