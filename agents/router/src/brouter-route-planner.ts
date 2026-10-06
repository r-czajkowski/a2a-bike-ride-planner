import { round } from '@bike-ride/geometry';
import {
  USER_AGENT,
  type LatLon,
  type PlannedRoute,
  type Route,
  type RoutePlanner,
} from './providers.ts';
import type { Bike } from './bike.ts';

const PROFILES: Record<Bike, string> = {
  road: 'fastbike',
  gravel: 'gravel',
  trekking: 'trekking',
};
const PAVED = new Set([
  'asphalt',
  'paved',
  'concrete',
  'paving_stones',
  'sett',
  'concrete:plates',
]);

// BRouter (brouter.de): bike routing on OpenStreetMap data. Free, no key.
export class BRouterRoutePlanner implements RoutePlanner {
  // BRouter's round-trip mode picks the loop itself, so we don't have to guess
  // towns (guessed towns tend to lie on one road: out and back, not a loop).
  // roundTripDistance acts like the loop's radius in metres; the loop comes
  // out roughly 6 times longer, depending on the profile, so if the first try
  // is off by more than 15% we rescale once.
  async planLoop(
    start: LatLon,
    distanceKm: number,
    bike: Bike,
  ): Promise<PlannedRoute> {
    const radiusM = (distanceKm * 1000) / 6;
    const first = await this.roundTrip(start, radiusM, bike);
    const ratio = distanceKm / first.route.distanceKm;

    if (Math.abs(ratio - 1) <= 0.15) return first;

    return this.roundTrip(start, radiusM * ratio, bike);
  }

  private async roundTrip(
    start: LatLon,
    radiusM: number,
    bike: Bike,
  ): Promise<PlannedRoute> {
    const params = new URLSearchParams({
      lonlats: `${start[1]},${start[0]}`, // BRouter wants lon,lat
      profile: PROFILES[bike],
      alternativeidx: '0',
      format: 'geojson',
      engineMode: '4', // round trip
      roundTripDistance: String(Math.round(radiusM)),
    });
    const url = `https://brouter.de/brouter?${params}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    });

    if (!res.ok) throw new Error(`BRouter: ${await res.text()}`);

    const feature = ((await res.json()) as any).features[0];
    const full: LatLon[] = feature.geometry.coordinates.map(
      ([lon, lat]: number[]) => [lat, lon],
    );
    const route: Route = {
      distanceKm: round(+feature.properties['track-length'] / 1000),
      ascentM: Math.round(+feature.properties['filtered ascend']),
      surface: this.surface(feature.properties.messages),
      coords: downsample(full, 300),
    };

    return { route, gpx: this.gpx(full) };
  }

  // properties.messages is a table: first row = header, then one row per way
  // segment.
  private surface(messages: string[][]): Route['surface'] {
    const [header, ...rows] = messages;
    const km = { pavedKm: 0, unpavedKm: 0, unknownKm: 0 };

    for (const row of rows) {
      const distance = +row[header.indexOf('Distance')] / 1000;
      const tag = row[header.indexOf('WayTags')].match(/surface=(\S+)/)?.[1];

      if (!tag) km.unknownKm += distance;
      else if (PAVED.has(tag)) km.pavedKm += distance;
      else km.unpavedKm += distance;
    }

    return {
      pavedKm: round(km.pavedKm),
      unpavedKm: round(km.unpavedKm),
      unknownKm: round(km.unknownKm),
    };
  }

  private gpx(coords: LatLon[]): string {
    const points = coords
      .map(([lat, lon]) => `<trkpt lat="${lat}" lon="${lon}"/>`)
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="${USER_AGENT}"
     xmlns="http://www.topografix.com/GPX/1/1">
<trk><name>Bike route</name><trkseg>
${points}
</trkseg></trk>
</gpx>
`;
  }
}

function downsample<T>(xs: T[], max: number): T[] {
  if (xs.length <= max) return xs;

  const step = (xs.length - 1) / (max - 1);

  return Array.from({ length: max }, (_, i) => xs[Math.round(i * step)]);
}
