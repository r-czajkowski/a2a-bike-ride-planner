import type { LatLon } from '@bike-ride/geometry';

// Identifies us to the data sources: the OpenStreetMap services ask every
// client to send a User-Agent.
export const USER_AGENT = 'bike-ride-guide/1.0.0';

export type Poi = {
  name: string;
  category: 'cafe' | 'shop' | 'water';
  lat: number;
  lon: number;
};

// The data source Guide depends on. To use another POI service, implement this.
export interface PoiProvider {
  // Cafes, shops and drinking water within `radiusM` of any of the points.
  findNear(points: LatLon[], radiusM: number): Promise<Poi[]>;
}
