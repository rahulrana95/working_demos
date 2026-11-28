/*
 * NOT PART OF THE INTERVIEW: production version.
 * Draws the courier on a plain SVG. The map is a picture for the eye. The
 * page writes the distance as text next to it, for everybody. A real app
 * puts map tiles under the picture.
 */
import { useState } from "react";
import { boundsAround, toMapPoint } from "./geo";
import type { Position } from "./types";
import { useSmoothPosition } from "./useSmoothPosition";

export interface CourierMapProps {
  courier: Position;
  destination: Position;
}

function assertOnEarth(position: Position): void {
  const isValid = Math.abs(position.lat) <= 90 && Math.abs(position.lng) <= 180;
  if (!isValid) {
    // NaN fails the test above too. The error boundary around the map catches this.
    throw new RangeError("The position is not on the earth");
  }
}

export function CourierMap({ courier, destination }: CourierMapProps) {
  assertOnEarth(courier);
  assertOnEarth(destination);
  // The box is made once, from the first position we get. So the map stays
  // still and only the marker moves.
  const [bounds] = useState(() => boundsAround([courier, destination]));
  const marker = toMapPoint(useSmoothPosition(courier) ?? courier, bounds);
  const home = toMapPoint(destination, bounds);

  return (
    // The picture is hidden from screen readers. The text of the page says the same.
    <svg className="courier-map__picture" viewBox="-8 -8 116 116" aria-hidden="true">
      {/* A square for the home and a circle for the courier: two shapes, not two colours. */}
      <rect className="courier-map__home" x={home.x - 4} y={home.y - 4} width="8" height="8" />
      <circle className="courier-map__courier" cx={marker.x} cy={marker.y} r="5" />
    </svg>
  );
}
