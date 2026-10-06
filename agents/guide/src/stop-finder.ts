import { distanceKm, round, type LatLon } from '@bike-ride/geometry';
import type { Poi, PoiProvider } from './providers.ts';

export type Stop = Poi & { km: number }; // km = where along the route

// Finds stops along a route: where each POI is (km from the start) and only a
// few of them. Knows nothing about the POI source.
export class StopFinder {
  // How far from the route a stop may be.
  static readonly RADIUS_M = 300;
  // Distance between the points that describe the route to the POI provider.
  static readonly QUERY_SPACING_KM = 0.5;
  // A city loop returned 116 POIs: keep at most one per category per 5 km.
  static readonly ONE_PER_KM = 5;

  private readonly provider: PoiProvider;

  constructor(provider: PoiProvider) {
    this.provider = provider;
  }

  async find(coords: LatLon[]): Promise<Stop[]> {
    const kmAt = this.kmAlong(coords);
    const pois = await this.provider.findNear(
      this.queryLine(coords, kmAt),
      StopFinder.RADIUS_M,
    );

    const seen = new Set<string>();
    const stops: Stop[] = [];

    for (const poi of pois) {
      const km = round(kmAt[this.nearestIndex(coords, [poi.lat, poi.lon])]);
      const key = `${poi.category}-${Math.floor(km / StopFinder.ONE_PER_KM)}`;

      if (seen.has(key)) continue;

      seen.add(key);
      stops.push({ ...poi, km });
    }

    return stops.toSorted((a, b) => a.km - b.km);
  }

  // Distance from the start to each point of the route.
  private kmAlong(coords: LatLon[]): number[] {
    const kmAt = [0];

    for (let i = 1; i < coords.length; i++)
      kmAt.push(kmAt[i - 1] + distanceKm(coords[i - 1], coords[i]));

    return kmAt;
  }

  // The route as a simpler line: a point every QUERY_SPACING_KM, whatever the
  // route's length, plus the last point. A short ride gets few points, a long
  // one more, and the line follows the road equally well in both.
  private queryLine(coords: LatLon[], kmAt: number[]): LatLon[] {
    const line = [coords[0]];
    let lastKm = 0;

    for (let i = 1; i < coords.length; i++) {
      const isLast = i === coords.length - 1;

      if (kmAt[i] - lastKm >= StopFinder.QUERY_SPACING_KM || isLast) {
        line.push(coords[i]);
        lastKm = kmAt[i];
      }
    }

    return line;
  }

  private nearestIndex(coords: LatLon[], point: LatLon): number {
    let best = 0;

    for (let i = 1; i < coords.length; i++) {
      if (distanceKm(coords[i], point) < distanceKm(coords[best], point))
        best = i;
    }

    return best;
  }
}
