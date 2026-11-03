# Parallax Agents

A cinematic marketing site for **Parallax Agents** — deploy a swarm of frontier AI
agents (Anthropic, OpenAI, Gemini) to run your business. Design, deploy, and
orchestrate 20–30 agents per employee from one console.

> Zero-dependency site with the existing marketing homepage, a synthetic-data
> agent demo, and a small server health endpoint. No application framework.

## Highlights

- **Ambient agent swarm** — a live canvas particle network of provider‑colored
  agents that links up and reacts to the cursor.
- **The Constellation** — an interactive radial visualization: one employee at the
  center, leads and specialists orbiting, beams flowing, full hover inspection.
- **Mission‑control console** — a typing terminal that deploys a swarm in front of you.
- Custom cursor, magnetic buttons, 3D tilt, parallax depth, scroll reveals, animated
  counters, and full `prefers-reduced-motion` fallbacks.

## Run locally

Use Node.js 22. No dependency installation or environment variables are required.

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

## Structure

```
index.html    structure + content
styles.css    design system + section styling
main.js       swarm, constellation, parallax, interactions
city-demo/   interactive agent quarter and its tests
api/health.mjs  shared Web Request/Response health handler
scripts/     dependency-free build and local server
dist/        generated public assets (ignored by Git)
DESIGN.md     full design system & build guide
```

See **[DESIGN.md](DESIGN.md)** for the complete design system: tokens, typography,
components, every section, and how the swarm and constellation work.

## Deploy

`npm run build` copies an explicit allowlist of nine files into `dist/`: the
unchanged homepage's HTML/CSS/JavaScript and the six runtime assets in
`city-demo/`. Tests, documentation, source configuration, and credentials are
excluded. `npm test` runs the existing event-engine and connection tests.

Vercel settings are committed in `vercel.json`: framework preset **Other**
(`null`), build command `node scripts/build.mjs`, output directory `dist`.
Vercel discovers `api/health.mjs` separately as a Node.js Function; it is not
published as a static file. The project needs no secrets for this demo.

The existing homepage stays at `/`; the interactive demo stays at `/city-demo/`.
Deploying requires a separate Vercel deployment action. A successful local build
or local health response does not establish hosted availability or custom-domain
routing.
