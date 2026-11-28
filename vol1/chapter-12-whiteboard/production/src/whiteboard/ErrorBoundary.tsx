/*
 * NOT PART OF THE INTERVIEW: production version.
 * If the whiteboard throws while it draws itself, the rest of the page must
 * keep working. This shows a short message and a button that starts the
 * whiteboard again.
 */
import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { SceneTooLargeError } from "./board";
import { DEFAULT_MESSAGES } from "./messages";
import type { WhiteboardMessages } from "./messages";

export interface WhiteboardErrorBoundaryProps {
  children: ReactNode;
  messages?: Partial<WhiteboardMessages>;
  /** For monitoring. It gets the error, never the scene. */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface BoundaryState {
  error: Error | null;
  /** Changes on every restart, so the children are built again from nothing. */
  attempt: number;
}

export class WhiteboardErrorBoundary extends Component<
  WhiteboardErrorBoundaryProps,
  BoundaryState
> {
  state: BoundaryState = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<BoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  render() {
    const { error, attempt } = this.state;
    const text = { ...DEFAULT_MESSAGES, ...this.props.messages };
    if (error === null) {
      return <div key={attempt}>{this.props.children}</div>;
    }
    return (
      <div className="whiteboard__failure" role="alert">
        <p>{error instanceof SceneTooLargeError ? text.tooLarge : text.failed}</p>
        <button type="button" onClick={() => this.setState({ error: null, attempt: attempt + 1 })}>
          {text.reload}
        </button>
      </div>
    );
  }
}
