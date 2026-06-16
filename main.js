/* ============================================================
   PARALLAX AGENTS — interaction layer
   ============================================================ */
(() => {
  "use strict";
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isTouch = window.matchMedia("(pointer: coarse)").matches;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---------------------------------------------------------
     PRELOADER
  --------------------------------------------------------- */
  const preloader = document.getElementById("preloader");
  const plBar = document.getElementById("plBar");
  let plP = 0;
  const plTimer = setInterval(() => {
    plP = Math.min(100, plP + Math.random() * 22);
    if (plBar) plBar.style.width = plP + "%";
    if (plP >= 100) {
      clearInterval(plTimer);
      setTimeout(() => {
        preloader.classList.add("done");
        document.body.classList.add("loaded");
        kickHeroReveals();
      }, 250);
    }
  }, 130);
  // safety
  window.addEventListener("load", () => { plP = 100; if (plBar) plBar.style.width = "100%"; });

  /* ---------------------------------------------------------
     AGENT SWARM CANVAS  (the signature motif)
     Provider-colored nodes orbit in clusters, link up when
     close, and react to the cursor like a gravitational lens.
  --------------------------------------------------------- */
  const canvas = document.getElementById("swarm");
  const ctx = canvas.getContext("2d");
  let W, H, DPR, nodes = [], scrollY = 0;
  const PROVIDERS = [
    { name: "anthropic", color: [217, 119, 87] },
    { name: "openai",    color: [25, 195, 156] },
    { name: "gemini",    color: [106, 166, 255] },
    { name: "core",      color: [138, 123, 255] },
  ];
  const mouse = { x: -9999, y: -9999, vx: 0, vy: 0, active: false };

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.width = innerWidth * DPR;
    H = canvas.height = innerHeight * DPR;
    canvas.style.width = innerWidth + "px";
    canvas.style.height = innerHeight + "px";
    buildNodes();
  }

  function buildNodes() {
    const area = (innerWidth * innerHeight);
    const count = clamp(Math.round(area / 16000), 36, isTouch ? 48 : 96);
    nodes = [];
    for (let i = 0; i < count; i++) {
      const p = PROVIDERS[Math.floor(Math.random() * PROVIDERS.length)];
      nodes.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.18 * DPR,
        vy: (Math.random() - 0.5) * 0.18 * DPR,
        r: (Math.random() * 1.6 + 1.1) * DPR,
        color: p.color,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: 0.01 + Math.random() * 0.02,
      });
    }
  }

  const LINK_DIST = 130;
  function drawSwarm() {
    ctx.clearRect(0, 0, W, H);
    const linkDist = LINK_DIST * DPR;
    const mx = mouse.x * DPR, my = mouse.y * DPR;

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      // drift
      n.x += n.vx; n.y += n.vy;
      n.pulse += n.pulseSpeed;

      // cursor gravitational lens
      if (mouse.active) {
        const dx = n.x - mx, dy = n.y - my;
        const d2 = dx * dx + dy * dy;
        const R = 170 * DPR;
        if (d2 < R * R) {
          const d = Math.sqrt(d2) || 1;
          const f = (1 - d / R) * 0.6;
          n.vx += (dx / d) * f * 0.4;
          n.vy += (dy / d) * f * 0.4;
        }
      }
      // gentle damping + speed cap
      n.vx *= 0.98; n.vy *= 0.98;
      const sp = Math.hypot(n.vx, n.vy), max = 0.6 * DPR;
      if (sp > max) { n.vx = (n.vx / sp) * max; n.vy = (n.vy / sp) * max; }

      // wrap
      if (n.x < -40) n.x = W + 40; if (n.x > W + 40) n.x = -40;
      if (n.y < -40) n.y = H + 40; if (n.y > H + 40) n.y = -40;

      // links
      for (let j = i + 1; j < nodes.length; j++) {
        const m = nodes[j];
        const dx = n.x - m.x, dy = n.y - m.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < linkDist * linkDist) {
          const d = Math.sqrt(d2);
          const a = (1 - d / linkDist) * 0.32;
          const c = n.color;
          ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${a})`;
          ctx.lineWidth = 0.6 * DPR;
          ctx.beginPath();
          ctx.moveTo(n.x, n.y);
          ctx.lineTo(m.x, m.y);
          ctx.stroke();
        }
      }
    }

    // nodes on top
    for (const n of nodes) {
      const glow = 0.6 + Math.sin(n.pulse) * 0.4;
      const c = n.color;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r * (1 + glow * 0.4), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.85})`;
      ctx.shadowBlur = 12 * DPR * glow;
      ctx.shadowColor = `rgba(${c[0]},${c[1]},${c[2]},0.9)`;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    requestAnimationFrame(drawSwarm);
  }

  if (!prefersReduced) {
    resize();
    window.addEventListener("resize", resize, { passive: true });
    requestAnimationFrame(drawSwarm);
  } else {
    canvas.style.display = "none";
  }

  /* ---------------------------------------------------------
     CUSTOM CURSOR + magnetic + hover states
  --------------------------------------------------------- */
  const cursor = document.getElementById("cursor");
  const cursorDot = document.getElementById("cursorDot");
  let cx = innerWidth / 2, cy = innerHeight / 2, tx = cx, ty = cy;

  if (!isTouch) {
    window.addEventListener("mousemove", (e) => {
      tx = e.clientX; ty = e.clientY;
      mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true;
      cursorDot.style.transform = `translate(${tx}px, ${ty}px) translate(-50%,-50%)`;
    });
    window.addEventListener("mouseout", () => { mouse.active = false; });

    (function cursorLoop() {
      cx = lerp(cx, tx, 0.18); cy = lerp(cy, ty, 0.18);
      cursor.style.transform = `translate(${cx}px, ${cy}px) translate(-50%,-50%)`;
      requestAnimationFrame(cursorLoop);
    })();

    document.querySelectorAll("[data-cursor='hover']").forEach((el) => {
      el.addEventListener("mouseenter", () => cursor.classList.add("is-hover"));
      el.addEventListener("mouseleave", () => cursor.classList.remove("is-hover"));
    });

    // magnetic buttons
    document.querySelectorAll("[data-magnetic]").forEach((el) => {
      const strength = 0.4;
      el.addEventListener("mousemove", (e) => {
        const r = el.getBoundingClientRect();
        const mx = e.clientX - (r.left + r.width / 2);
        const my = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${mx * strength}px, ${my * strength}px)`;
      });
      el.addEventListener("mouseleave", () => { el.style.transform = ""; });
    });
  }

  /* ---------------------------------------------------------
     NAV scroll state + scroll progress
  --------------------------------------------------------- */
  const nav = document.getElementById("nav");
  const progress = document.getElementById("scrollProgress");
  function onScroll() {
    scrollY = window.scrollY;
    nav.classList.toggle("scrolled", scrollY > 30);
    const max = document.documentElement.scrollHeight - innerHeight;
    progress.style.width = (max > 0 ? (scrollY / max) * 100 : 0) + "%";
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------------------------------------------------------
     HERO parallax layers (mouse + scroll)
  --------------------------------------------------------- */
  const heroLayers = document.querySelectorAll("#heroLayers .layer");
  let mxN = 0, myN = 0; // normalized -1..1
  if (!isTouch && !prefersReduced) {
    window.addEventListener("mousemove", (e) => {
      mxN = (e.clientX / innerWidth - 0.5) * 2;
      myN = (e.clientY / innerHeight - 0.5) * 2;
    });
  }
  (function heroParallax() {
    const sy = scrollY;
    heroLayers.forEach((l) => {
      const d = parseFloat(l.dataset.depth) || 0.1;
      const px = -mxN * d * 60;
      const py = -myN * d * 60 + sy * d * 0.5;
      l.style.transform = `translate3d(${px}px, ${py}px, 0)`;
    });
    requestAnimationFrame(heroParallax);
  })();

  /* ---------------------------------------------------------
     REVEAL on scroll
  --------------------------------------------------------- */
  const revealEls = document.querySelectorAll(".reveal, .reveal-mask");
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) {
        en.target.classList.add("in");
        io.unobserve(en.target);
      }
    });
  }, { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });
  revealEls.forEach((el) => io.observe(el));

  function kickHeroReveals() {
    document.querySelectorAll(".hero .reveal, .hero .reveal-mask").forEach((el, i) => {
      setTimeout(() => el.classList.add("in"), 120 + i * 90);
    });
  }

  /* ---------------------------------------------------------
     STEPS rail fill
  --------------------------------------------------------- */
  const stepsFill = document.getElementById("stepsFill");
  if (stepsFill) {
    const so = new IntersectionObserver((ents) => {
      ents.forEach((e) => { if (e.isIntersecting) { stepsFill.style.width = "100%"; so.disconnect(); } });
    }, { threshold: 0.4 });
    so.observe(document.querySelector(".how"));
  }

  /* ---------------------------------------------------------
     CARD spotlight (mouse position vars) + tilt
  --------------------------------------------------------- */
  document.querySelectorAll(".vcard").forEach((card) => {
    card.addEventListener("mousemove", (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    });
  });

  if (!isTouch && !prefersReduced) {
    document.querySelectorAll("[data-tilt]").forEach((el) => {
      const max = parseFloat(el.dataset.tiltMax) || 9;
      el.addEventListener("mousemove", (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = `perspective(900px) rotateY(${px * max}deg) rotateX(${-py * max}deg)`;
      });
      el.addEventListener("mouseleave", () => { el.style.transform = ""; });
    });
  }

  /* ---------------------------------------------------------
     COUNTERS
  --------------------------------------------------------- */
  function animateCount(el) {
    const target = parseFloat(el.dataset.count);
    const suffix = el.dataset.suffix || "";
    const dur = 1600;
    const start = performance.now();
    function tick(now) {
      const t = clamp((now - start) / dur, 0, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  const countIO = new IntersectionObserver((ents) => {
    ents.forEach((e) => { if (e.isIntersecting) { animateCount(e.target); countIO.unobserve(e.target); } });
  }, { threshold: 0.6 });
  document.querySelectorAll("[data-count]").forEach((el) => countIO.observe(el));

  /* ---------------------------------------------------------
     HERO live ticker (looping fake telemetry)
  --------------------------------------------------------- */
  const sAgents = document.getElementById("statAgents");
  const sTasks = document.getElementById("statTasks");
  const sUptime = document.getElementById("statUptime");
  let baseAgents = 1280;
  function tickTelemetry() {
    if (sAgents) sAgents.textContent = (baseAgents += Math.floor(Math.random() * 3)).toLocaleString();
    if (sTasks) sTasks.textContent = (3200 + Math.floor(Math.random() * 600)).toLocaleString();
    if (sUptime) sUptime.textContent = (99.9 + Math.random() * 0.09).toFixed(2);
  }
  tickTelemetry();
  setInterval(tickTelemetry, 1800);

  /* ---------------------------------------------------------
     CONSOLE — typing terminal + agent pills spawning
  --------------------------------------------------------- */
  const termCmd = document.getElementById("termCmd");
  const termOut = document.getElementById("termOut");
  const appAgents = document.getElementById("appAgents");

  const AGENTS = [
    { name: "Sales SDR", prov: "anthropic" },
    { name: "Support L1", prov: "openai" },
    { name: "Research", prov: "gemini" },
    { name: "Ops Runner", prov: "anthropic" },
    { name: "Finance", prov: "openai" },
    { name: "Marketing", prov: "gemini" },
    { name: "Recruiter", prov: "anthropic" },
    { name: "Analyst", prov: "openai" },
    { name: "QA Bot", prov: "gemini" },
    { name: "Scheduler", prov: "anthropic" },
    { name: "Outreach", prov: "openai" },
    { name: "Legal Rev", prov: "gemini" },
  ];
  const provDot = { anthropic: "var(--anthropic)", openai: "var(--openai)", gemini: "var(--gemini)" };

  function typeText(el, text, speed = 42) {
    return new Promise((res) => {
      let i = 0;
      (function step() {
        el.textContent = text.slice(0, i++);
        if (i <= text.length) setTimeout(step, speed);
        else res();
      })();
    });
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function addOut(html, cls = "") {
    const div = document.createElement("div");
    div.className = cls;
    div.innerHTML = html;
    termOut.appendChild(div);
  }

  function spawnAgent(a, i) {
    const pill = document.createElement("div");
    pill.className = "agent-pill";
    pill.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:${provDot[a.prov]};box-shadow:0 0 6px ${provDot[a.prov]}"></span>${a.name}<span class="ap-status"></span>`;
    appAgents.appendChild(pill);
    setTimeout(() => pill.classList.add("in"), 40 + i * 55);
  }

  async function runConsole() {
    if (prefersReduced) {
      termCmd.textContent = "deploy swarm --provider auto --agents 12";
      addOut("✓ swarm deployed — 12 agents live", "ok");
      AGENTS.forEach((a, i) => spawnAgent(a, i));
      return;
    }
    termCmd.textContent = "";
    termOut.innerHTML = "";
    appAgents.innerHTML = "";
    await wait(400);
    await typeText(termCmd, "deploy swarm --provider auto --agents 12");
    await wait(350);
    addOut('<span class="muted">› provisioning accounts across Anthropic · OpenAI · Gemini…</span>');
    await wait(700);
    addOut('<span class="muted">› routing roles, wiring tools & memory…</span>');
    await wait(700);
    AGENTS.forEach((a, i) => spawnAgent(a, i));
    await wait(900);
    addOut('<span class="ok">✓ swarm live — 12 agents online, 0 errors</span>');
  }

  const consoleIO = new IntersectionObserver((ents) => {
    ents.forEach((e) => { if (e.isIntersecting) { runConsole(); consoleIO.disconnect(); } });
  }, { threshold: 0.3 });
  const consoleEl = document.getElementById("console");
  if (consoleEl) consoleIO.observe(consoleEl);

  // animate side nav items as ambient activity
  const sideItems = document.querySelectorAll(".app__side-item");
  if (sideItems.length && !prefersReduced) {
    let idx = 0;
    setInterval(() => {
      sideItems.forEach((s) => s.classList.remove("is-active"));
      sideItems[idx % sideItems.length].classList.add("is-active");
      idx++;
    }, 2600);
  }

  /* ---------------------------------------------------------
     CTA form
  --------------------------------------------------------- */
  const form = document.getElementById("ctaForm");
  const email = document.getElementById("ctaEmail");
  const note = document.getElementById("ctaNote");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = (email.value || "").trim();
      const ok = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
      if (!ok) {
        note.textContent = "Enter a valid work email to request access.";
        note.classList.remove("ok");
        email.focus();
        return;
      }
      note.textContent = "✓ You're on the list — we'll reach out to set up your swarm.";
      note.classList.add("ok");
      email.value = "";
      email.disabled = true;
    });
  }

  /* ---------------------------------------------------------
     CONSTELLATION — a living radial swarm.
     One employee at the center; leads orbit on an inner ring,
     specialists fan out on an outer ring. Beams flow with data,
     the whole field slowly orbits (pausing on hover), and any
     agent can be inspected in the side panel.
  --------------------------------------------------------- */
  (function constellation() {
    const svg = document.getElementById("constellSvg");
    const stage = document.getElementById("constellStage");
    const cpFocus = document.getElementById("cpFocus");
    const cpLegend = document.getElementById("cpLegend");
    if (!svg || !cpFocus) return;

    const NS = "http://www.w3.org/2000/svg";
    const CX = 310, CY = 310, INNER = 115, OUTER = 225;
    const R_CENTER = 30, R_LEAD = 18, R_SPEC = 10;

    const PROV_NAME = { anthropic: "Anthropic", openai: "OpenAI", gemini: "Gemini", core: "Parallax" };
    const modelFor = (prov, tier) => ({
      anthropic: ["Claude Opus", "Claude Sonnet"],
      openai: ["GPT frontier", "GPT mini"],
      gemini: ["Gemini Pro", "Gemini Flash"],
    }[prov][tier === "lead" ? 0 : 1]);

    const LEADS = [
      { label: "Sales", prov: "anthropic", role: "Owns pipeline generation and directs the sales swarm.", specs: [
        { label: "SDR Agent", prov: "anthropic", role: "Prospects and qualifies leads around the clock." },
        { label: "Outreach", prov: "openai", role: "Personalizes multi-channel sequences at scale." } ] },
      { label: "Support", prov: "openai", role: "Coordinates resolution across every channel.", specs: [
        { label: "Triage", prov: "openai", role: "Routes and answers incoming tickets in seconds." },
        { label: "Escalations", prov: "gemini", role: "Resolves edge cases with full account context." } ] },
      { label: "Research", prov: "gemini", role: "Runs always-on market and competitive intelligence.", specs: [
        { label: "Market Intel", prov: "gemini", role: "Monitors signals and surfaces what matters." },
        { label: "Synthesis", prov: "anthropic", role: "Distills sources into briefs your team can act on." } ] },
      { label: "Operations", prov: "anthropic", role: "Keeps every workflow moving end to end.", specs: [
        { label: "Workflows", prov: "anthropic", role: "Reconciles systems and chases approvals." },
        { label: "Approvals", prov: "openai", role: "Pushes tasks through review without the wait." } ] },
      { label: "Finance", prov: "openai", role: "Closes the books faster, with a clean trail.", specs: [
        { label: "Reconcile", prov: "openai", role: "Categorizes and matches transactions continuously." },
        { label: "Reporting", prov: "gemini", role: "Prepares reports and flags anomalies early." } ] },
    ];

    const el = (tag, attrs) => {
      const n = document.createElementNS(NS, tag);
      for (const k in attrs) n.setAttribute(k, attrs[k]);
      return n;
    };

    // defs: center gradient
    const defs = el("defs", {});
    const grad = el("radialGradient", { id: "coreGrad", cx: "35%", cy: "30%", r: "75%" });
    grad.appendChild(el("stop", { offset: "0", "stop-color": "#b3a6ff" }));
    grad.appendChild(el("stop", { offset: "0.55", "stop-color": "#8a7bff" }));
    grad.appendChild(el("stop", { offset: "1", "stop-color": "#5d6bff" }));
    defs.appendChild(grad);
    svg.appendChild(defs);

    const beamLayer = el("g", {});
    const nodeLayer = el("g", {});
    svg.appendChild(beamLayer);
    svg.appendChild(nodeLayer);

    const baseAngles = [-90, -18, 54, 126, 198];
    const SPEC_SPREAD = 17;
    const orbiting = [];   // nodes that move
    const beams = [];      // {line, a, b}  a/b = {x,y} providers or center

    const center = { x: CX, y: CY, isCenter: true };

    function makeNode(tier, prov, datum) {
      const g = el("g", { class: `cnode cnode--${tier}` });
      const halo = el("circle", { class: `cnode__halo ph-${prov}`, r: tier === "center" ? R_CENTER * 1.9 : (tier === "lead" ? R_LEAD * 1.9 : R_SPEC * 2), "fill-opacity": tier === "center" ? 0.4 : 0.18 });
      const core = el("circle", { class: `cnode__core pf-${prov}`, r: tier === "center" ? R_CENTER : (tier === "lead" ? R_LEAD : R_SPEC) });
      const label = el("text", { class: "cnode__label" });
      label.textContent = datum.label;
      g.appendChild(halo); g.appendChild(core); g.appendChild(label);
      nodeLayer.appendChild(g);
      return { g, halo, core, label, tier, prov, datum };
    }

    // center node "You"
    const centerNode = makeNode("center", "core", { label: "You" });
    centerNode.core.setAttribute("cx", CX); centerNode.core.setAttribute("cy", CY);
    centerNode.halo.setAttribute("cx", CX); centerNode.halo.setAttribute("cy", CY);
    centerNode.label.setAttribute("x", CX); centerNode.label.setAttribute("y", CY + R_CENTER + 20);
    centerNode.label.setAttribute("text-anchor", "middle");
    centerNode.label.setAttribute("dominant-baseline", "hanging");

    // build leads + specs
    LEADS.forEach((lead, k) => {
      const leadDatum = { label: lead.label, prov: lead.prov, role: lead.role, tier: "lead", parent: "You", model: modelFor(lead.prov, "lead") };
      const node = makeNode("lead", lead.prov, leadDatum);
      node.baseAngle = baseAngles[k]; node.radius = INNER;
      const beam = el("line", { class: `beam bs-${lead.prov}` });
      beamLayer.appendChild(beam);
      node.parentBeam = beam;
      node.beamFrom = center;
      beams.push({ line: beam, from: center, to: node });
      orbiting.push(node);

      lead.specs.forEach((spec, s) => {
        const specDatum = { label: spec.label, prov: spec.prov, role: spec.role, tier: "spec", parent: lead.label, model: modelFor(spec.prov, "spec") };
        const sn = makeNode("spec", spec.prov, specDatum);
        sn.baseAngle = baseAngles[k] + (s === 0 ? -SPEC_SPREAD : SPEC_SPREAD);
        sn.radius = OUTER;
        const sbeam = el("line", { class: `beam bs-${spec.prov}` });
        beamLayer.appendChild(sbeam);
        sn.parentBeam = sbeam;
        sn.leadRef = node;
        beams.push({ line: sbeam, from: node, to: sn });
        orbiting.push(sn);
      });
    });

    // ---- animation ----
    let offset = 0, paused = false, raf = 0;
    const SPEED = 0.05; // deg/frame ≈ 120s per rotation

    function place() {
      if (!paused && !prefersReduced) offset += SPEED;
      for (const n of orbiting) {
        const a = (n.baseAngle + offset) * Math.PI / 180;
        const nx = Math.cos(a), ny = Math.sin(a);
        const x = CX + n.radius * nx;
        const y = CY + n.radius * ny;
        n.x = x; n.y = y;
        n.core.setAttribute("cx", x); n.core.setAttribute("cy", y);
        n.halo.setAttribute("cx", x); n.halo.setAttribute("cy", y);
        // label radiates outward, stays upright
        const r = (n.tier === "lead" ? R_LEAD : R_SPEC) + 11;
        n.label.setAttribute("x", x + nx * r);
        n.label.setAttribute("y", y + ny * r);
        n.label.setAttribute("text-anchor", nx > 0.35 ? "start" : nx < -0.35 ? "end" : "middle");
        n.label.setAttribute("dominant-baseline", ny > 0.35 ? "hanging" : ny < -0.35 ? "auto" : "central");
      }
      for (const b of beams) {
        b.line.setAttribute("x1", b.from.x); b.line.setAttribute("y1", b.from.y);
        b.line.setAttribute("x2", b.to.x); b.line.setAttribute("y2", b.to.y);
      }
      raf = requestAnimationFrame(place);
    }

    // ---- panel rendering ----
    const DEFAULT_FOCUS =
      '<div class="cp-focus__tag">Operator</div>' +
      '<div class="cp-focus__name"><span class="dot dot--core"></span>You</div>' +
      '<p class="cp-focus__role">Set the goal — your swarm of 15 agents plans, executes, and reports back across Anthropic, OpenAI, and Gemini. Always on, fully auditable.</p>' +
      '<div class="cp-focus__meta">15 agents · 3 providers · 24/7 autonomous</div>';
    cpFocus.innerHTML = DEFAULT_FOCUS;

    function renderFocus(d) {
      if (!d) { cpFocus.innerHTML = DEFAULT_FOCUS; return; }
      const tierLabel = d.tier === "lead" ? "Lead" : "Specialist";
      cpFocus.innerHTML =
        `<div class="cp-focus__tag">${tierLabel} · ${PROV_NAME[d.prov]}</div>` +
        `<div class="cp-focus__name"><span class="dot dot--${d.prov}"></span>${d.label}</div>` +
        `<p class="cp-focus__role">${d.role}</p>` +
        `<div class="cp-focus__meta">${d.model} · reports to ${d.parent}</div>`;
    }

    const allNodes = [centerNode, ...orbiting];
    function focus(node) {
      allNodes.forEach((n) => n.g.classList.remove("is-focus", "is-dim"));
      beams.forEach((b) => b.line.classList.remove("is-lit"));
      if (!node) { renderFocus(null); return; }
      node.g.classList.add("is-focus");
      // dim everything else for contrast
      allNodes.forEach((n) => { if (n !== node && n !== centerNode) n.g.classList.add("is-dim"); });
      // light the chain back to center
      if (node.parentBeam) node.parentBeam.classList.add("is-lit");
      if (node.leadRef) {
        node.leadRef.g.classList.remove("is-dim");
        if (node.leadRef.parentBeam) node.leadRef.parentBeam.classList.add("is-lit");
      }
      renderFocus(node.datum);
    }

    orbiting.forEach((n) => {
      n.g.addEventListener("mouseenter", () => { focus(n); if (cursor) cursor.classList.add("is-hover"); });
      n.g.addEventListener("mouseleave", () => { focus(null); if (cursor) cursor.classList.remove("is-hover"); });
    });
    if (stage) {
      stage.addEventListener("mouseenter", () => { paused = true; });
      stage.addEventListener("mouseleave", () => { paused = false; focus(null); });
    }

    // ---- legend ----
    const counts = { anthropic: 0, openai: 0, gemini: 0 };
    orbiting.forEach((n) => counts[n.prov]++);
    const maxC = Math.max(counts.anthropic, counts.openai, counts.gemini);
    const order = [["anthropic", "Anthropic"], ["openai", "OpenAI"], ["gemini", "Gemini"]];
    cpLegend.innerHTML = order.map(([k, name]) =>
      `<div class="cp-row"><span class="cp-row__name"><i class="dot dot--${k}"></i>${name}</span>` +
      `<span class="cp-track"><span class="cp-fill cp-fill--${k}" data-w="${(counts[k] / maxC) * 100}"></span></span>` +
      `<span class="cp-row__val">${counts[k]}</span></div>`
    ).join("");

    // animate legend bars + start orbit when in view
    const cio = new IntersectionObserver((ents) => {
      ents.forEach((e) => {
        if (e.isIntersecting) {
          cpLegend.querySelectorAll(".cp-fill").forEach((f) => { f.style.width = f.dataset.w + "%"; });
          cio.disconnect();
        }
      });
    }, { threshold: 0.3 });
    cio.observe(svg);

    place();
  })();

  /* ---------------------------------------------------------
     Smooth anchor scroll (respect reduced motion)
  --------------------------------------------------------- */
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      if (id === "#" || id.length < 2) return;
      const t = document.querySelector(id);
      if (!t) return;
      e.preventDefault();
      t.scrollIntoView({ behavior: prefersReduced ? "auto" : "smooth", block: "start" });
    });
  });
})();
