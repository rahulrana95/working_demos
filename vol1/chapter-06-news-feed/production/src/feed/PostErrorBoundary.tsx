/*
 * NOT PART OF THE INTERVIEW: production version.
 * One error boundary around the inside of every post. When one post cannot
 * be drawn, for example because the server sent data in a shape we did not
 * expect, that post shows a short message. The other posts stay.
 * Without it, one bad post would blank the whole feed.
 */
import { Component } from "react";
import type { ReactNode } from "react";

export interface PostErrorBoundaryProps {
  postId: string;
  /** What to show in place of the post. */
  fallback: ReactNode;
  /** Called once when the post fails. It gets the id only, never the data. */
  onError: (postId: string) => void;
  children: ReactNode;
}

// An error boundary must be a class: React has no hook for it.
export class PostErrorBoundary extends Component<PostErrorBoundaryProps, { hasFailed: boolean }> {
  state = { hasFailed: false };

  static getDerivedStateFromError(): { hasFailed: boolean } {
    return { hasFailed: true };
  }

  componentDidCatch(): void {
    this.props.onError(this.props.postId);
  }

  render(): ReactNode {
    return this.state.hasFailed ? this.props.fallback : this.props.children;
  }
}
