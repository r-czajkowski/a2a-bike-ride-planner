// Small geometry helpers on [lat, lon] pairs. Pure math, shared by the agents.
import { z } from 'zod';

export const LatLonSchema = z.tuple([
  z.number().min(-90).max(90),
  z.number().min(-180).max(180),
]);
export type LatLon = z.infer<typeof LatLonSchema>;

export const rad = (deg: number) => (deg * Math.PI) / 180;

// One decimal place: enough for km and km/h.
export const round = (x: number) => Math.round(x * 10) / 10;

// Great-circle distance (haversine).
export function distanceKm([lat1, lon1]: LatLon, [lat2, lon2]: LatLon): number {
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) *
      Math.cos(rad(lat2)) *
      Math.sin(rad(lon2 - lon1) / 2) ** 2;

  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

// Compass direction from one point to the next, in degrees.
export function bearing([lat1, lon1]: LatLon, [lat2, lon2]: LatLon): number {
  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
  const x =
    Math.cos(rad(lat1)) * Math.sin(rad(lat2)) -
    Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));

  return (Math.atan2(y, x) * 180) / Math.PI;
}
