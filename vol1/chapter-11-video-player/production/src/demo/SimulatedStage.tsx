/*
 * NOT PART OF THE INTERVIEW.
 * Wraps a player and gives its <video> element the simulated video.
 * A layout effect runs before the effects of the player, so the simulation is
 * in place before the player sets `src`. No real network request is made.
 */
import { useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";
import { simulateMedia } from "./simulatedMedia";
import type { SimulatedMedia, SimulatedMediaOptions } from "./simulatedMedia";

export interface SimulatedStageProps {
  children: ReactNode;
  options?: SimulatedMediaOptions;
  /** Called with the controls of the simulation, before the player loads the source. */
  onMedia: (media: SimulatedMedia, video: HTMLVideoElement) => void;
}

export function SimulatedStage({ children, options, onMedia }: SimulatedStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const video = stageRef.current?.querySelector("video");
    if (video === null || video === undefined) {
      return;
    }
    const media = simulateMedia(video, options);
    onMedia(media, video);
    return media.stop;
    // The simulation is set up once for each player. A parent that wants a
    // fresh one gives this component a new `key`.
  }, []);

  return (
    <div className="stage" ref={stageRef}>
      {children}
    </div>
  );
}
