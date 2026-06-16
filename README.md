# Parallax Agents

A cinematic marketing site for **Parallax Agents** — deploy a swarm of frontier AI
agents (Anthropic, OpenAI, Gemini) to run your business. Design, deploy, and
orchestrate 20–30 agents per employee from one console.

> Built as a zero‑dependency static site: one HTML file, one stylesheet, one script.
> No framework, no build step.

## Highlights

- **Ambient agent swarm** — a live canvas particle network of provider‑colored
  agents that links up and reacts to the cursor.
- **The Constellation** — an interactive radial visualization: one employee at the
  center, leads and specialists orbiting, beams flowing, full hover inspection.
- **Mission‑control console** — a typing terminal that deploys a swarm in front of you.
- Custom cursor, magnetic buttons, 3D tilt, parallax depth, scroll reveals, animated
  counters, and full `prefers-reduced-motion` fallbacks.

## Run locally

```bash
python3 -m http.server 4321
# → http://localhost:4321
```

Or just open `index.html` in a browser.

## Structure

```
index.html    structure + content
styles.css    design system + section styling
main.js       swarm, constellation, parallax, interactions
DESIGN.md     full design system & build guide
```

See **[DESIGN.md](DESIGN.md)** for the complete design system: tokens, typography,
components, every section, and how the swarm and constellation work.

## Deploy

Static — deploys anywhere with no build step (Vercel, Netlify, GitHub Pages).
On Vercel: framework preset **Other**, no build command, output directory **`.`**.
