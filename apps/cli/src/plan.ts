// Plans a ride with the A2A team. Needs `pnpm start` running. Run (from the
// repo root): pnpm plan "50 km loop from Białystok on Saturday with coffee"
import { RemoteAgent } from '@bike-ride/a2a';
import { A2ARidePlanner } from './a2a-ride-planner.ts';
import { OutputWriter } from './output-writer.ts';
import {
  askInTerminal,
  printSummary,
  requestFromArgs,
  timed,
} from './terminal.ts';

const planner = new A2ARidePlanner(new RemoteAgent('planner'), askInTerminal);
const result = await timed(planner, requestFromArgs());

printSummary(result);
new OutputWriter().write(result.ride);
