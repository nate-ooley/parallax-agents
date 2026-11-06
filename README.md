# Parallax Agents

A cinematic marketing site for **Parallax Agents** — deploy a swarm of frontier AI
agents (Anthropic, OpenAI, Gemini) to run your business. Design, deploy, and
orchestrate 20–30 agents per employee from one console.

> Zero-dependency site with the existing marketing homepage, a synthetic-data
> agent demo, a private HighLevel workflow viewer, and server endpoints. No application framework.

## Highlights

- **Ambient agent swarm** — a live canvas particle network of provider‑colored
  agents that links up and reacts to the cursor.
- **The Constellation** — an interactive radial visualization: one employee at the
  center, leads and specialists orbiting, beams flowing, full hover inspection.
- **Mission‑control console** — a typing terminal that deploys a swarm in front of you.
- Custom cursor, magnetic buttons, 3D tilt, parallax depth, scroll reveals, animated
  counters, and full `prefers-reduced-motion` fallbacks.

## Run locally

Use Node.js 22. The public site and demo need no dependency installation or environment variables.

```bash
npm run dev
# → http://127.0.0.1:4175
# → http://127.0.0.1:4175/city-demo/
```

The server binds only to `127.0.0.1`. To choose another port, run
`npm run dev -- --port 4176`. Startup builds the public assets into `dist/`;
restart after editing source files to rebuild them.

`GET /api/health` uses the same handler locally and on Vercel. It returns
`ok`, `service: "parallax-agents"`, `mode: "demo"`, and a fresh ISO `checkedAt`.
`HEAD` returns the same status and headers without a body; other methods return
405 with `Allow: GET, HEAD`. Health responses are not cached.

This checks the web server, not customer integrations or AI-provider availability.
All agent-demo inputs, costs, messages, and appointments remain synthetic.

## Private HighLevel city

`/city-live/` is a separate owner-only view of three existing Autocraft Studios
workflows. It reads HighLevel through `/api/highlevel`; the integration token
stays on the server. Sign in with the generated owner access key. Sessions expire
after eight hours, and replacing `PARALLAX_VIEWER_KEY` invalidates all sessions.
This is a single-owner pilot, not a customer account or tenant management system.

Configure the three server-only values listed in `.env.example`. The current
Vercel connection is scoped to Preview and the feature branch. The private owner
key is also saved locally in ignored `.env.viewer` for Nathan; it is not the
HighLevel token. Never commit either credential or put it into a URL.

The view shows actual workflow names and published/draft states. These states
do not prove execution. On November 5, 2026, the workflow inventory API succeeded,
but HighLevel refused execution logs with `WORKFLOW_API_NOT_ENABLED_FOR_LOCATION`.
Until that capability is enabled, activity history and run counts are unavailable.
The UI must show that limitation explicitly; it must never substitute demo data.

If enabled, the logs reader fetches a complete 24-hour snapshot and groups records
by workflow and execution. A successful step does not prove a booking, delivery,
or completed workflow. No customer names, addresses, message content, raw errors,
or raw workflow definitions are returned to the browser. No workflows or CRM
records are changed by this connection.

## Structure

```
index.html    structure + content
styles.css    design system + section styling
main.js       swarm, constellation, parallax, interactions
city-demo/   interactive agent quarter and its tests
city-live/   private workflow city and sign-in interface
api/         health, private session, and read-only HighLevel handlers
lib/         server-only authentication and HighLevel projection
scripts/     dependency-free build and local server
dist/        generated public assets (ignored by Git)
DESIGN.md     full design system & build guide
```

See **[DESIGN.md](DESIGN.md)** for the complete design system: tokens, typography,
components, every section, and how the swarm and constellation work.

## Deploy

`npm run build` copies an explicit allowlist of public files into `dist/`: the
unchanged homepage's HTML/CSS/JavaScript and the six runtime assets in
`city-demo/` and the private view's static shell in `city-live/`. Tests, documentation, source configuration, and credentials are
excluded. `npm test` checks the demo event engine, connection projections, private
authentication, and the HighLevel reader using synthetic source responses.

Vercel settings are committed in `vercel.json`: framework preset **Other**
(`null`), build command `node scripts/build.mjs`, output directory `dist`.
Vercel discovers the handlers in `api/` separately as Node.js Functions; they are
not published as static files. The public demo needs no secrets. The private
connection fails closed when its server configuration or owner session is missing.

The existing homepage stays at `/`; the interactive demo stays at `/city-demo/`.
Deploying requires a separate Vercel deployment action. A successful local build
or local health response does not establish hosted availability or custom-domain
routing.
