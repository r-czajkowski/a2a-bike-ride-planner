import { USER_AGENT, type Geocoder, type Place } from './providers.ts';

// OpenStreetMap Nominatim. Free, no key, max 1 request per second.
export class NominatimGeocoder implements Geocoder {
  static readonly MIN_GAP_MS = 1100;

  // When the next request may start. Shared by all tasks on purpose: the rate
  // limit is per process, not per task.
  private nextSlot = 0;

  async geocode(query: string): Promise<Place[]> {
    // Reserve a slot before the first `await`. JavaScript runs one call at a
    // time up to that point, so concurrent calls get different slots.
    const start = Math.max(Date.now(), this.nextSlot);

    this.nextSlot = start + NominatimGeocoder.MIN_GAP_MS;
    await new Promise((resolve) => setTimeout(resolve, start - Date.now()));

    const params = new URLSearchParams({
      q: query,
      format: 'json',
      limit: '3',
      // Without this, "Wasilków" resolves to a village near Kyiv.
      countrycodes: 'pl',
    });
    const url = `https://nominatim.openstreetmap.org/search?${params}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    });
    const results = (await res.json()) as any[];

    return results.map((r) => ({
      name: r.display_name,
      lat: +r.lat,
      lon: +r.lon,
    }));
  }
}
