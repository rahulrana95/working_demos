/*
 * NOT PART OF THE INTERVIEW: production version.
 * An error boundary around the map. A map is the part of the page most
 * likely to break (a bad position, a library that fails to load), and the
 * least needed: the status, the time and the distance are all text. So when
 * the map throws, only the map goes away.
 */
import { Component } from "react";
import type { ReactNode } from "react";

interface MapBoundaryProps {
  /** Shown in place of the map after an error. */
  fallback: ReactNode;
  onError: () => void;
  children: ReactNode;
}

export class MapBoundary extends Component<MapBoundaryProps, { hasFailed: boolean }> {
  state = { hasFailed: false };

  static getDerivedStateFromError() {
    return { hasFailed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.hasFailed ? this.props.fallback : this.props.children;
  }
}
