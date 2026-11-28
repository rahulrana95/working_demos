/*
 * NOT PART OF THE INTERVIEW: production version.
 * An error boundary. If the code of the player throws while React draws it,
 * React would remove the whole page. This component catches the error, shows
 * a short message in the place of the player, and reports the failure. The
 * rest of the page keeps working.
 *
 * A boundary must be a class: React has no hook for catching such errors.
 */
import { Component } from "react";
import type { ReactNode } from "react";
import type { PlayerMetricEvent } from "./metrics";

export interface PlayerErrorBoundaryProps {
  children: ReactNode;
  crashedText: string;
  reloadText: string;
  onEvent?: (event: PlayerMetricEvent) => void;
}

interface BoundaryState {
  hasCrashed: boolean;
}

export class PlayerErrorBoundary extends Component<PlayerErrorBoundaryProps, BoundaryState> {
  state: BoundaryState = { hasCrashed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { hasCrashed: true };
  }

  componentDidCatch() {
    // The error text can hold addresses and other data, so only the kind is sent.
    this.props.onEvent?.({ type: "error", kind: "render", retry: 0 });
  }

  render() {
    if (!this.state.hasCrashed) {
      return this.props.children;
    }

    return (
      <div className="player player--crashed" role="alert">
        <p>{this.props.crashedText}</p>
        {/* A new start: the player below is made again from nothing. */}
        <button type="button" onClick={() => this.setState({ hasCrashed: false })}>
          {this.props.reloadText}
        </button>
      </div>
    );
  }
}
