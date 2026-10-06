import type { LatLon } from '@bike-ride/geometry';
import type { Bike } from './bike.ts';

// Identifies us to the data sources: the OpenStreetMap services ask every
// client to send a User-Agent.
export const USER_AGENT = 'bike-ride-router/1.0.0';

export type { LatLon };

export type Place = { name: string; lat: number; lon: number };

// The route Router sends to other agents as a DataPart. Other agents rely only
// on what arrives over the wire; they declare the fields they read themselves.
export type Route = {
  distanceKm: number;
  ascentM: number;
  surface: { pavedKm: number; unpavedKm: number; unknownKm: number };
  // downsampled to ~300 points; enough for maps, wind and stops
  coords: LatLon[];
};

// GPX keeps the full geometry
export type PlannedRoute = { route: Route; gpx: string };

// The data sources Router depends on. Swap a provider by implementing one of
// these.

export interface Geocoder {
  // Up to 3 candidates for a place name in Poland.
  geocode(query: string): Promise<Place[]>;
}

export interface RoutePlanner {
  // A loop of about `distanceKm` from the start and back.
  planLoop(
    start: LatLon,
    distanceKm: number,
    bike: Bike,
  ): Promise<PlannedRoute>;
}
