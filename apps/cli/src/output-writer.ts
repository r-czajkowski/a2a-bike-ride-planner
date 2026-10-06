import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { RidePlan } from './a2a-ride-planner.ts';

// Writes plan.md and route.gpx to output/ in the repo root.
export class OutputWriter {
  static readonly DIR = resolve(import.meta.dirname, '../../../output');
  // Added to every plan in code, so the model can't leave it out.
  static readonly RIDE_IT = `

## Ride it
- **See it on a map:** open [gpx.studio](https://gpx.studio) and drop \`route.gpx\` on it.
  Turn on the direction arrows to see which way to ride; the stops show up as points.
- **Take it with you:** import \`route.gpx\` into Garmin Connect, Strava, Komoot or
  any other app that reads GPX, then send it to your bike computer or phone.
`;

  write(ride: RidePlan): void {
    this.file('plan.md', ride.plan.trimEnd() + OutputWriter.RIDE_IT);
    this.file('route.gpx', this.withStops(ride));
    console.log(`Wrote plan.md and route.gpx to ${OutputWriter.DIR}`);
  }

  private file(name: string, content: string): void {
    mkdirSync(OutputWriter.DIR, { recursive: true });
    writeFileSync(`${OutputWriter.DIR}/${name}`, content);
  }

  // Router's GPX has only the track; Guide's stops come later, so we add them
  // here as waypoints. GPX 1.1 wants waypoints before the track.
  private withStops({ gpx, stops }: RidePlan): string {
    const waypoints = stops.map(
      (s) =>
        `<wpt lat="${s.lat}" lon="${s.lon}"><name>${xml(s.name)}</name>` +
        `<desc>${s.category}, km ${s.km}</desc><type>${s.category}</type></wpt>\n`,
    );

    return gpx.replace('<trk>', `${waypoints.join('')}<trk>`);
  }
}

const xml = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
