/*
 * NOT PART OF THE INTERVIEW: production version.
 * Small pure functions for the courier map: a distance, a point between two
 * points, and lat/lng to x/y.
 */
import type { Position } from "./types";

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** The distance over the surface of the earth, in kilometres (the haversine formula). */
export function distanceKm(from: Position, to: Position): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/** The point on the line from `from` to `to`. Progress 0 is `from`, 1 is `to`. */
export function positionBetween(from: Position, to: Position, progress: number): Position {
  return {
    lat: from.lat + (to.lat - from.lat) * progress,
    lng: from.lng + (to.lng - from.lng) * progress,
  };
}

export interface MapBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** The smallest box that holds all the positions, with some room around them. */
export function boundsAround(positions: Position[], padding = 0.2): MapBounds {
  const lats = positions.map((position) => position.lat);
  const lngs = positions.map((position) => position.lng);
  // A box of one point has no size. The small number keeps the division safe.
  const latRoom = (Math.max(...lats) - Math.min(...lats)) * padding || 0.001;
  const lngRoom = (Math.max(...lngs) - Math.min(...lngs)) * padding || 0.001;
  return {
    south: Math.min(...lats) - latRoom,
    north: Math.max(...lats) + latRoom,
    west: Math.min(...lngs) - lngRoom,
    east: Math.max(...lngs) + lngRoom,
  };
}

/**
 * Turns a position into x and y from 0 to 100 inside the box. North is up,
 * so y grows to the south. A position outside the box is put on its edge.
 */
export function toMapPoint(position: Position, bounds: MapBounds): { x: number; y: number } {
  const clamp = (value: number) => Math.min(100, Math.max(0, value));
  return {
    x: clamp(((position.lng - bounds.west) / (bounds.east - bounds.west)) * 100),
    y: clamp(((bounds.north - position.lat) / (bounds.north - bounds.south)) * 100),
  };
}
