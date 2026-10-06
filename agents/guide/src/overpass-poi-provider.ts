import { USER_AGENT, type Poi, type PoiProvider } from './providers.ts';
import type { LatLon } from '@bike-ride/geometry';

// OpenStreetMap via the Overpass API. Free, no key. Tries a second instance if
// the first fails (the main one was down while the demo was being prototyped).
export class OverpassPoiProvider implements PoiProvider {
  static readonly INSTANCES = [
    'https://overpass-api.de/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  ];

  async findNear(points: LatLon[], radiusM: number): Promise<Poi[]> {
    const around = `around:${radiusM},${points.flat().join(',')}`;
    const query = `[out:json][timeout:25];(
      nwr["amenity"="cafe"](${around});
      nwr["shop"~"^(convenience|bakery|supermarket)$"](${around});
      nwr["amenity"="drinking_water"](${around});
    );out center;`;
    const elements = await this.query(query);

    return elements.map((e) => ({
      name: e.tags.name ?? e.tags.amenity ?? e.tags.shop,
      category:
        e.tags.amenity === 'cafe' ? 'cafe' : e.tags.shop ? 'shop' : 'water',
      lat: e.lat ?? e.center?.lat,
      lon: e.lon ?? e.center?.lon,
    }));
  }

  private async query(query: string): Promise<any[]> {
    const errors: string[] = [];

    for (const url of OverpassPoiProvider.INSTANCES) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'User-Agent': USER_AGENT },
          body: new URLSearchParams({ data: query }),
        });

        if (res.ok) return ((await res.json()) as any).elements;

        errors.push(`${new URL(url).host}: HTTP ${res.status}`);
      } catch (err) {
        // try the next instance
        errors.push(`${new URL(url).host}: ${(err as Error).message}`);
      }
    }

    throw new Error(`Overpass: all instances failed (${errors.join('; ')})`);
  }
}
