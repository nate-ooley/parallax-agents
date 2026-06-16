# Parallax Agents — Design System & Build Guide

A cinematic, single‑page marketing site for **Parallax Agents** — a platform that
deploys swarms of frontier AI agents (Anthropic, OpenAI, Gemini) across a business.

The name drove the design language: **depth, layers, and motion at different
speeds**. Everything on the page is built around two signature motifs — an ambient
**agent‑swarm particle field** and an interactive **constellation** where one
employee sits at the center of their own orbiting swarm.

---

## 1. Tech & architecture

| Concern | Choice | Why |
|---|---|---|
| Markup | Single `index.html` | One cinematic narrative, top to bottom |
| Styling | One `styles.css`, CSS custom properties | No framework; full control, instant load |
| Behavior | One `main.js`, vanilla ES (IIFE) | Zero dependencies, no build step |
| Fonts | Google Fonts (Space Grotesk, Inter, JetBrains Mono) | Loaded via `<link>` |
| Rendering | Canvas 2D (swarm) + SVG (constellation) + DOM | Right tool per motif |

**No build, no bundler, no node_modules.** Open `index.html` or serve the folder
statically. This keeps the site fast, portable, and trivially deployable.

```
ParallaxAgents/
├── index.html      # structure + content
├── styles.css      # design system + all section styling
├── main.js         # swarm, constellation, parallax, interactions
├── DESIGN.md       # this document
└── README.md       # quick start
```

---

## 2. Design tokens

All tokens live in `:root` at the top of `styles.css`.

### Color

| Token | Value | Role |
|---|---|---|
| `--bg` | `#06060c` | Page background (near‑black, violet undertone) |
| `--bg-2` | `#0a0a14` | Raised surfaces |
| `--panel` | `rgba(255,255,255,.03)` | Glass card fill |
| `--panel-2` | `rgba(255,255,255,.05)` | Hover / track fill |
| `--line` | `rgba(255,255,255,.09)` | Hairline borders |
| `--line-2` | `rgba(255,255,255,.16)` | Stronger borders |
| `--ink` | `#f3f2fb` | Primary text |
| `--ink-soft` | `#b9b7cf` | Secondary text |
| `--ink-mute` | `#74728f` | Tertiary / labels |

### Accent & gradient

| Token | Value |
|---|---|
| `--violet` | `#8a7bff` |
| `--indigo` | `#5d6bff` |
| `--cyan` | `#46e6d8` |
| `--magenta` | `#d96bff` |
| `--grad` | `linear-gradient(110deg,#b3a6ff,#8a7bff 35%,#46e6d8)` |
| `--grad-soft` | `linear-gradient(110deg,#8a7bff,#46e6d8)` |

The violet→cyan gradient is the brand signature — used on the logo mark, primary
buttons, gradient headline words (`.grad`), step numbers, and metric figures.

### Provider colors

These are used everywhere a provider is represented (chips, dots, swarm nodes,
constellation beams, legend bars).

| Provider | Token | Value |
|---|---|---|
| Anthropic | `--anthropic` | `#d97757` (clay/coral) |
| OpenAI | `--openai` | `#19c39c` (teal‑green) |
| Gemini | `--gemini` | `#6aa6ff` (blue) |

### Shape & motion

| Token | Value | Role |
|---|---|---|
| `--radius` | `18px` | Cards / panels |
| `--radius-sm` | `12px` | Small elements |
| `--ease` | `cubic-bezier(.22,1,.36,1)` | The house easing (gentle overshoot‑free ease‑out) |
| `--maxw` | `1240px` | Content max width |

---

## 3. Typography

Three families, each with a job:

- **Space Grotesk** — display. Headings, brand, step numbers, terminal, metrics.
- **Inter** — body copy and UI text.
- **JetBrains Mono** — eyebrows, labels, code/terminal, meta, the live ticker.

Headings use fluid sizing with `clamp()` so they scale smoothly from mobile to
desktop, e.g. the hero is `clamp(2.6rem, 7.5vw, 5.4rem)`, section `h2` is
`clamp(2rem, 5vw, 3.4rem)`. Tight letter‑spacing (`-0.025em`→`-0.035em`) on large
type for a modern, condensed feel.

---

## 4. Core components

### Buttons (`.btn`)
- `.btn--solid` — gradient fill, dark ink, glowing shadow. Primary CTA.
- `.btn--line` — glass outline. Secondary.
- `.btn--ghost` — text only. Tertiary (nav "Sign in").
- `.btn--lg` — larger padding for hero/CTA.
- Arrow icons translate on hover; `data-magnetic` buttons pull toward the cursor.

### Cards
- `.vcard` — value cards with a cursor‑following radial spotlight (`--mx/--my`).
- `.step` — "how it works" cards with gradient number badges and a fill rail.
- `.scard` — swarm function cards with a gradient left‑edge wipe on hover.
- `.pcard` — provider cards with a provider‑tinted radial glow.
- All cards: glass fill, hairline border that brightens on hover, lift on hover,
  and optional 3D `data-tilt`.

### Navigation (`.nav`)
Fixed; transparent at top, then gains blur + background + border once scrolled
(`.scrolled`). Links have an animated gradient underline. Collapses links below
900px, hides the ghost button below 560px.

### Glass app mock (`.app`)
The "mission control" console: window chrome, sidebar, a typing terminal, and a
grid of agent pills that spawn in sequence (see §7).

---

## 5. Page sections (in order)

1. **Preloader** — orbiting mark + progress bar; fades out and triggers hero reveals.
2. **Hero** — parallax depth layers (glow / grid / pulsing rings), masked headline
   reveal, provider chips, scroll cue, and a live telemetry ticker.
3. **Marquee** — infinite scrolling list of business functions.
4. **Value** — "Your employees are capped. Their agents aren't." + 3 spotlight cards.
5. **How it works** — Design → Deploy → Scale, with a rail that fills in view.
6. **The Console** — copy + the interactive mission‑control mock.
7. **The Swarm** — six function cards (Sales, Support, Research, Ops, Finance, Marketing).
8. **Constellation** — the interactive radial swarm visualization (see §8).
9. **Providers** — Anthropic / OpenAI / Gemini cards + "every frontier next" line.
10. **Impact** — four animated counters (30 agents, 3 providers, 24/7, 10×).
11. **CTA** — email capture with inline validation.
12. **Footer** — brand, nav columns, legal.

---

## 6. The agent swarm (ambient canvas)

`#swarm` is a fixed full‑viewport `<canvas>` behind everything (`z-index: 0`).

- **Nodes** are provider‑colored points (Anthropic / OpenAI / Gemini / Parallax‑core).
  Count scales with viewport area, clamped to 36–96 (fewer on touch).
- Each node drifts slowly, pulses (size + glow), and **wraps** at edges.
- Nodes within `~130px` are **linked** with a faint line tinted to the node color —
  this builds the "network of agents" texture.
- The cursor acts as a **gravitational lens**: nodes within ~170px are nudged toward
  it, then damped and speed‑capped so the field never destabilizes.
- DPR‑aware (capped at 2) for crisp rendering without overdraw.
- Disabled entirely under `prefers-reduced-motion`.

---

## 7. The Console (typing terminal)

When the console scrolls into view (IntersectionObserver, once):
1. The prompt **types** `deploy swarm --provider auto --agents 12`.
2. Two muted "provisioning / routing" log lines appear on a delay.
3. Twelve **agent pills** spawn in a staggered cascade, each with a provider‑colored
   status dot.
4. A green success line confirms "swarm live — 12 agents online".

The sidebar items also cycle an active state as ambient activity. Under
reduced‑motion, the end state is rendered immediately with no typing.

---

## 8. The Constellation (signature visualization)

The centerpiece. An SVG diagram (`viewBox 0 0 620 620`, center `310,310`) showing
**one employee surrounded by their swarm**, built entirely in `main.js`.

### Structure
- **Center node** — "You" (violet radial‑gradient core + pulsing halo), fixed at center.
- **Inner ring** (`r = 115`) — 5 **lead** agents at 72° intervals: Sales, Support,
  Research, Operations, Finance.
- **Outer ring** (`r = 225`) — 10 **specialist** agents, each clustered ±17° around
  its lead so the tree visibly fans out (e.g. Sales → SDR + Outreach).
- **Beams** — `<line>` connections forming the hierarchy You → lead → specialist,
  tinted to the child's provider, with an animated flowing dash (`beamflow`).

### Motion
- The whole field **slowly orbits** (~0.05°/frame ≈ 120s per rotation), recomputed
  per frame in `place()` so beams track node positions exactly and labels stay upright.
- Orbit **pauses on hover** of the stage so the diagram is easy to inspect.
- The center halo breathes via the `corepulse` keyframe.

### Interaction
- Hovering any agent: it scales up, its **label reveals** (specialist labels are
  hidden until hover to reduce clutter), the **beam chain back to center lights up**,
  and every other node **dims** for contrast.
- The side **info panel** updates to show the agent's tier, provider, role, model,
  and who it reports to. On leave it returns to the default "Operator / You" summary.
- A **composition legend** shows live provider counts (Anthropic 5, OpenAI 6,
  Gemini 4) with bars that animate to width when the section enters view.

### Key CSS hooks
- `.cnode`, `.cnode--center|lead|spec`, `.cnode__halo|core|label`
- `.cnode.is-focus` (enlarge + reveal label), `.cnode.is-dim` (fade others)
- `.beam`, `.beam.is-lit`, `.bs-{provider}` (stroke color)
- `.pf-{provider}` / `.ph-{provider}` (node fill / halo fill)
- Node scaling uses `transform-box: fill-box; transform-origin: center` so circles
  scale around their own center even while `cx/cy` change each frame.

---

## 9. Interactions & motion system

| Feature | Element / hook | Notes |
|---|---|---|
| Custom cursor | `#cursor`, `#cursorDot` | Lerped ring + instant dot; grows on `[data-cursor="hover"]` |
| Magnetic buttons | `[data-magnetic]` | Translate toward cursor, release on leave |
| 3D tilt | `[data-tilt]` (`data-tilt-max`) | Perspective rotate from pointer offset |
| Reveal on scroll | `.reveal`, `.reveal-mask` | IntersectionObserver adds `.in` |
| Hero parallax | `#heroLayers .layer[data-depth]` | Mouse + scroll, per‑layer depth |
| Scroll progress | `#scrollProgress` | Gradient bar at top |
| Counters | `[data-count][data-suffix]` | Cubic ease‑out, fire once in view |
| Live telemetry | hero ticker | Looping pseudo‑metrics |
| Smooth anchors | `a[href^="#"]` | Honors reduced motion |

---

## 10. Accessibility & performance

- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` disables the swarm
  canvas, beam flow, core pulse, reveals, and the console typing (end state shown).
- **Touch**: custom cursor, magnetic, and tilt are skipped on coarse pointers; node
  counts reduced.
- **Semantics**: single `<h1>`, sectioned headings, `aria-label`s on nav, the
  canvas/decorative layers marked `aria-hidden`, the SVG given a descriptive label.
- **Performance**: no dependencies; canvas DPR capped at 2; node count clamped;
  animations are transform/opacity‑based; observers disconnect after firing.

---

## 11. Responsive breakpoints

| Width | Change |
|---|---|
| ≤ 980px | Console stacks (copy over mock) |
| ≤ 940px | Constellation stacks (diagram over panel) |
| ≤ 900px | Nav links hide |
| ≤ 880px | Value / steps / provider grids → single column; swarm → 2‑col |
| ≤ 760px | Impact metrics → 2×2 |
| ≤ 600px | Swarm grid → single column |
| ≤ 560px | Nav "Sign in" hides; console sidebar hides |

---

## 12. Run & deploy

**Local:**
```bash
cd ParallaxAgents
python3 -m http.server 4321
# open http://localhost:4321
```

**Deploy:** any static host (Vercel, Netlify, GitHub Pages, S3). No build command;
output directory is the project root.
