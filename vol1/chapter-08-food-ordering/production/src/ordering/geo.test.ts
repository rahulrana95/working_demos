/* NOT PART OF THE INTERVIEW: production version. */
import { boundsAround, distanceKm, positionBetween, toMapPoint } from "./geo";

const RESTAURANT = { lat: 12.9716, lng: 77.5946 };
const HOME = { lat: 12.985, lng: 77.61 };

describe("distanceKm", () => {
  it("is zero for the same place", () => {
    expect(distanceKm(HOME, HOME)).toBe(0);
  });

  it("is about 111 km for one degree of latitude", () => {
    expect(distanceKm({ lat: 12, lng: 77 }, { lat: 13, lng: 77 })).toBeCloseTo(111.19, 1);
  });

  it("is the same in both directions", () => {
    expect(distanceKm(RESTAURANT, HOME)).toBeCloseTo(distanceKm(HOME, RESTAURANT), 10);
    expect(distanceKm(RESTAURANT, HOME)).toBeCloseTo(2.24, 1);
  });
});

describe("positionBetween", () => {
  it("is the start at 0, the end at 1 and the middle at 0.5", () => {
    expect(positionBetween(RESTAURANT, HOME, 0)).toEqual(RESTAURANT);
    expect(positionBetween(RESTAURANT, HOME, 1)).toEqual(HOME);
    expect(positionBetween({ lat: 0, lng: 10 }, { lat: 2, lng: 20 }, 0.5)).toEqual({
      lat: 1,
      lng: 15,
    });
  });
});

describe("the map box", () => {
  it("holds every position with room around it", () => {
    const bounds = boundsAround([RESTAURANT, HOME]);

    expect(bounds.south).toBeLessThan(RESTAURANT.lat);
    expect(bounds.north).toBeGreaterThan(HOME.lat);
    expect(bounds.west).toBeLessThan(RESTAURANT.lng);
    expect(bounds.east).toBeGreaterThan(HOME.lng);
  });

  it("has a size also when all positions are one place", () => {
    const bounds = boundsAround([HOME, HOME]);

    expect(bounds.north).toBeGreaterThan(bounds.south);
    expect(toMapPoint(HOME, bounds)).toEqual({ x: 50, y: 50 });
  });

  it("puts north at the top and east at the right", () => {
    const bounds = { south: 0, north: 10, west: 0, east: 10 };

    expect(toMapPoint({ lat: 10, lng: 0 }, bounds)).toEqual({ x: 0, y: 0 });
    expect(toMapPoint({ lat: 0, lng: 10 }, bounds)).toEqual({ x: 100, y: 100 });
    expect(toMapPoint({ lat: 7.5, lng: 2.5 }, bounds)).toEqual({ x: 25, y: 25 });
  });

  it("keeps a position outside the box on the edge of the map", () => {
    const bounds = { south: 0, north: 10, west: 0, east: 10 };

    expect(toMapPoint({ lat: 50, lng: -50 }, bounds)).toEqual({ x: 0, y: 0 });
  });
});
