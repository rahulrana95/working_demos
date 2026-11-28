/*
 * NOT PART OF THE INTERVIEW: production version.
 * The quality menu: "Auto", or one level picked by hand. The engine owns the
 * levels and does the switching. This component only shows them and passes
 * the choice of the user on.
 */
import { useEffect, useState } from "react";
import type { QualityLevel } from "./chooseQuality";
import type { StreamingEngine } from "./engine";
import type { PlayerMessages } from "./messages";

export interface QualityMenuProps {
  engine: StreamingEngine;
  messages: PlayerMessages;
}

const AUTO = "auto";

export function QualityMenu({ engine, messages }: QualityMenuProps) {
  const [levels, setLevels] = useState<QualityLevel[]>(engine.levels);
  // The level the engine loads now, and whether the user fixed it.
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAuto, setIsAuto] = useState(true);

  useEffect(() => {
    // A new engine starts in "Auto", with its own levels.
    setLevels(engine.levels());
    setIsAuto(true);

    return engine.subscribe((event) => {
      if (event.type === "levels") {
        setLevels(event.levels);
      } else if (event.type === "level_switched") {
        setCurrentIndex(event.index);
      }
    });
  }, [engine]);

  // One level is no choice. A plain video file has none at all.
  if (levels.length < 2) {
    return null;
  }

  const name = (level: QualityLevel | undefined) => (level === undefined ? "" : `${level.height}p`);

  function handleChange(value: string) {
    setIsAuto(value === AUTO);
    engine.setLevel(value === AUTO ? AUTO : Number(value));
  }

  return (
    <select
      className="player__select"
      aria-label={messages.quality}
      value={isAuto ? AUTO : currentIndex}
      onChange={(event) => handleChange(event.target.value)}
    >
      <option value={AUTO}>{messages.autoQuality(name(levels[currentIndex]))}</option>
      {levels.map((level, index) => (
        <option key={level.height} value={index}>
          {name(level)}
        </option>
      ))}
    </select>
  );
}
