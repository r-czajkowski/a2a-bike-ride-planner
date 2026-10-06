# A2A Bike Ride Planner

A small demo of agent-to-agent communication over the [A2A protocol](https://a2a-protocol.org/v1.0.0/specification/) (v1.0).
Four agents, each its own process on its own port, plan a real bike ride with real data.

You type one sentence:

```
50 km loop from Białystok on Saturday, start 9:00, coffee halfway.
```

and get `output/plan.md` and `output/route.gpx` (for Garmin / Strava / Komoot).

```
  plan.ts ─▶ Planner (:9100)
                │  A2A (JSON-RPC over HTTP, SSE)
       ┌────────┼──────────────┐
       ▼        ▼              ▼
    Router    Weather        Guide          all plain TS + Anthropic SDK
    :9101      :9102         :9103
   BRouter,   Open-Meteo    Overpass
   Nominatim
```

## Setup

Requires Node 24 (`nvm use` reads `.nvmrc`) and pnpm. Node runs the `.ts` files directly; there is no build step for the agents.

```bash
pnpm install
cp .env.example .env        # add your ANTHROPIC_API_KEY
```

## Run

```bash
pnpm start                  # the 4 agents; leave this terminal open to watch them talk

pnpm plan "50 km loop from Białystok on Saturday with coffee"
```

If the request is missing the distance or the bike type, the Router asks you (`input-required`), you answer in the terminal, and the plan is written to `output/`.

To see the route on a map, drop `output/route.gpx` on [gpx.studio](https://gpx.studio).

Other commands:

| Command | What it does |
|---|---|
| `pnpm typecheck` | type check everything |
| `pnpm format` | format with oxfmt (`.oxfmtrc.json`) |
| `pnpm lint` | lint with oxlint (`.oxlintrc.json`) |
| `pnpm check` | format check + lint + type check |

## Project layout

A pnpm workspace. Each agent is its own package with its own dependencies, as if separate teams
owned them: each specialist owns its data source.
Agents share no domain code: Weather and Guide declare only the route fields they read from
the DataPart Router sends. The only thing the agents agree on is the JSON they send each other.

```
packages/
  a2a/        @bike-ride/a2a   A2AAgent (abstract), AgentServer, RemoteAgent, TaskContext, Parts
  llm/        @bike-ride/llm   Tool (interface), ClaudeToolLoop, Usage, models and prices
  geometry/   @bike-ride/geometry  LatLon, distanceKm, bearing: pure math shared by the agents
agents/
  router/     @bike-ride/router    Geocoder + RoutePlanner -> NominatimGeocoder, BRouterRoutePlanner
  weather/    @bike-ride/weather   WeatherProvider -> OpenMeteoProvider; WindAnalyzer
  guide/      @bike-ride/guide     PoiProvider -> OverpassPoiProvider; StopFinder
  planner/    @bike-ride/planner   PlannerAgent, PlanWriter -> ClaudePlanWriter
apps/
  cli/        @bike-ride/cli        A2ARidePlanner; plan
```

Every agent has the same shape:

```
agents/weather/src/
  providers.ts            interface WeatherProvider          <- the data source contract
  open-meteo-provider.ts  class OpenMeteoProvider implements WeatherProvider
  wind-analyzer.ts        class WindAnalyzer                 <- domain logic, provider-agnostic
  tools.ts                class WindAnalysisTool implements Tool
  weather-agent.ts        class WeatherAgent extends A2AAgent  (implements handle())
  main.ts                 AgentServer.fromAgent(new WeatherAgent(new WindAnalyzer(new OpenMeteoProvider()))).run()
```

To use another forecast service, write a class that implements `WeatherProvider` and change
that one line in `main.ts`. The same goes for `Geocoder`, `RoutePlanner` and `PoiProvider`.

## Validation (zod)

Everything that crosses a process boundary is validated with zod:

| Input | Where | On failure |
|---|---|---|
| A2A request (text + DataPart) | each agent's `XxxRequest` schema, `task.parse()` | task `rejected` with the reason |
| Other agents' artifacts | `result.dataAs('route', RouteReply)` in Planner and CLI | error |
| Tool input from Claude | each tool's `input` schema (also the JSON Schema Claude sees) | error sent back to Claude, which retries |
| Command line | `requestFromArgs()` in the CLI | usage message |

`rejected` is A2A's "bad request": the caller's input was wrong. `failed` means the agent itself broke.

## Agent discovery

Every agent runs on its own port and serves its Agent Card at the standard well-known URI:

```
http://localhost:9101/.well-known/agent-card.json   # Router
http://localhost:9102/.well-known/agent-card.json   # Weather
...
```

## Watching the agents talk

The `pnpm start` terminal shows every step, one line each, with the agent's name:

```
[planner] ← task 3f2a9c1d "Find a loop from Białystok on Saturday"
[router] ← task 9c1d7e0a "Find a loop from Białystok on Saturday"
[router] input-required: What distance and which bike type?
[planner] input-required: What distance and which bike type?
[planner] ← task 3f2a9c1d "40 km, gravel"
[router] ← task 9c1d7e0a "40 km, gravel"
[router] working: geocode {"query":"Białystok"}
[router] working: planRoute {...}
[router] artifact: route
[router] completed
[weather] ← task 51be02c4 "..." + data
...
```

- **←** a message arrived (`+ data` when it carries a DataPart)
- **working / input-required / completed / failed / rejected**: the task's status updates
- **artifact**: a result the agent sends back (route, weather, stops, answer)

## Where to look in the code

| A2A concept | Code |
|---|---|
| Agent Card, discovery | `A2AAgent.card` in `packages/a2a/src/a2a-agent.ts`; `RemoteAgent` in `remote-agent.ts` |
| Task lifecycle, streaming | `A2AAgent.execute()` calls each agent's `handle()`; `TaskContext` publishes `working` / `input-required` / `completed` |
| Asking back (`input-required`) | `RouterAgent.handle()`; relayed by `PlannerAgent` |
| Data between agents (`DataPart`, file part) | Router's `route` artifact; Planner sends it to Weather and Guide |
| Orchestration | `PlannerAgent.handle()`: Router, then Weather and Guide in parallel (`Promise.all`), then the plan |
