/** Parallax Agents: an original Paris-inspired, event-driven operations quarter. */
let cityInstance = 0;
const instances = new WeakMap();
const STATES = new Set(['idle', 'running', 'complete', 'failed', 'review']);
const STATE_LABELS = { idle: 'Ready', running: 'Working', complete: 'Complete', failed: 'Needs attention', review: 'Awaiting approval' };
const BUILDINGS = {
  response: { x: 420, y: 430, w: 70, d: 38, h: 144, color: '#743b43', fallback: 'Response agent', number: '01' },
  booking: { x: 582, y: 326, w: 65, d: 35, h: 126, color: '#486779', fallback: 'Booking agent', number: '02' },
  followup: { x: 748, y: 430, w: 65, d: 35, h: 154, color: '#607365', fallback: 'Follow-up agent', number: '03' },
};
const CONNECTIONS = {
  inbox: { x: 24, y: 182, label: 'Inbox', agent: 'response', route: 'M239 252 C280 252 285 328 345 355 L420 430' },
  knowledge: { x: 24, y: 406, label: 'Knowledge', agent: 'response', route: 'M239 476 L286 476 L345 442 L420 430' },
  calendar: { x: 921, y: 182, label: 'Calendar', agent: 'booking', route: 'M921 252 L876 252 L758 184 L582 286 L582 326' },
  messages: { x: 921, y: 406, label: 'Messages', agent: 'followup', route: 'M748 430 L818 470 L870 476 L921 476' },
};
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cut = (value, length) => String(value ?? '').length > length ? `${String(value).slice(0, length - 1)}…` : String(value ?? '');
const points = list => list.map(p => p.map(n => Math.round(n * 100) / 100).join(',')).join(' ');
const poly = (list, attrs = '') => `<polygon points="${points(list)}" ${attrs}/>`;
const blend = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

function limestone(x, y, w, d, h, fill = '#e8d9bb') {
  const a = [[x, y - d], [x + w, y], [x, y + d], [x - w, y]];
  const b = a.map(([px, py]) => [px, py - h]);
  return poly([a[3], a[2], b[2], b[3]], `fill="${fill}" stroke="#b8a98f" stroke-width=".8"`)
    + poly([a[2], a[1], b[1], b[2]], 'fill="#d6c6a8" stroke="#b4a184" stroke-width=".8"')
    + poly(b, 'fill="#f1e6ce" stroke="#c2b191" stroke-width=".8"');
}

function mansard(x, y, w, d, color = '#52636c', grand = false) {
  const rise = grand ? 39 : 32;
  const lower = [[x, y - d], [x + w, y], [x, y + d], [x - w, y]];
  const upper = [[x, y - d * .64 - rise], [x + w * .64, y - rise], [x, y + d * .64 - rise], [x - w * .64, y - rise]];
  let output = poly([lower[3], lower[2], upper[2], upper[3]], `fill="${color}" stroke="#3d4d56" stroke-width="1"`)
    + poly([lower[2], lower[1], upper[1], upper[2]], 'fill="#3e505b" stroke="#35454e" stroke-width="1"')
    + poly(upper, 'fill="#687b83" stroke="#3c5059" stroke-width=".8"');
  for (let face = 0; face < 2; face++) {
    const start = face ? lower[2] : lower[3];
    const end = face ? lower[1] : lower[2];
    for (let i = 1; i < 8; i++) {
      const base = blend(start, end, i / 8);
      const top = blend(face ? upper[2] : upper[3], face ? upper[1] : upper[2], i / 8);
      output += `<path d="M${base[0]} ${base[1]}L${top[0]} ${top[1]}" stroke="#b6c2bd" stroke-opacity=".19" stroke-width=".6"/>`;
    }
    for (const fraction of [.28, .7]) {
      const p = blend(start, end, fraction);
      const slope = face ? -d / w : d / w;
      output += `<g transform="matrix(1 ${slope} 0 1 ${p[0] - 6} ${p[1] - 5})"><path d="M-2 0v-19l8-8 8 8V0Z" fill="#eddfc2" stroke="#b5a588" stroke-width=".8"/><path d="M-4-19l10-10 10 10" fill="none" stroke="#354b59" stroke-width="3"/><path d="M2-2v-13q4-6 8 0V-2Z" fill="#58717c"/><path d="M6-19v17M2-10h8" stroke="#e1d8c2" stroke-width="1"/></g>`;
    }
  }
  output += limestone(x - 18, y - rise - 7, 6, 3.3, 22, '#ccb79b');
  output += limestone(x + 23, y - rise + 4, 5, 2.8, 17, '#c8b69a');
  return output;
}

function facade(agent, side, w, d, h) {
  const { x, y, color } = BUILDINGS[agent.id];
  const tx = side ? x : x - w;
  const ty = side ? y + d - h : y - h;
  const slope = side ? -d / w : d / w;
  const floors = agent.id === 'booking' ? 3 : 4;
  const floorHeight = (h - 34) / floors;
  let output = `<g transform="matrix(1 ${slope} 0 1 ${tx} ${ty})">`;
  for (let floor = 0; floor < floors; floor++) {
    const top = 8 + floor * floorHeight;
    output += `<path d="M0 ${top + floorHeight - 3}H${w}" stroke="#bcaa8d" stroke-width="1"/><path d="M0 ${top + floorHeight - 1}H${w}" stroke="#fff5dc" stroke-opacity=".7" stroke-width="1.5"/>`;
    for (let column = 0; column < 3; column++) {
      const px = 8 + column * ((w - 17) / 3);
      const wh = Math.min(19, floorHeight - 5);
      const isWorking = agent.status === 'running';
      const hasRun = agent.successfulRuns > 0;
      const paneClass = isWorking ? 'city-window-active' : hasRun ? 'city-window-lit' : 'city-window-dark';
      const fill = isWorking || hasRun ? '#f2ce88' : '#819294';
      output += `<path d="M${px - 2} ${top + 4}q7-8 14 0v${wh}h-14Z" fill="#f5ead3" stroke="#b5a283" stroke-width=".6"/>`;
      output += `<path class="${paneClass}" style="animation-delay:-${((floor * 3 + column + side * 4) % 8) * .24}s" d="M${px} ${top + 4}q5-5 10 0v${wh - 2}h-10Z" fill="${fill}"/>`;
      output += `<path d="M${px + 5} ${top + 1}v${wh + 1}M${px} ${top + wh / 2 + 4}h10" stroke="#ece1c8" stroke-width=".9"/>`;
      if (floor === 1 || floor === floors - 1) {
        output += `<path d="M${px - 3} ${top + wh + 2}h16v-7h-16Z" fill="#48514d" fill-opacity=".07" stroke="#49514b" stroke-width=".7"/>`;
        for (let bar = 0; bar < 5; bar++) output += `<path d="M${px - 1 + bar * 3} ${top + wh - 5}v7" stroke="#49514b" stroke-width=".65"/>`;
        if (floor === 1 && column !== 1) output += `<rect x="${px - 1}" y="${top + wh + 1}" width="12" height="3" rx=".5" fill="#9d7456"/><path d="M${px} ${top + wh}l2-4 2 3 2-4 2 4 2-3" fill="none" stroke="#668066" stroke-width="2"/><circle cx="${px + 3}" cy="${top + wh - 2}" r="1.5" fill="#b3656c"/><circle cx="${px + 8}" cy="${top + wh - 3}" r="1.6" fill="#d2a06a"/>`;
      }
    }
  }
  const ground = h - 23;
  output += `<path d="M5 ${ground}h${w - 10}v23H5Z" fill="#ede1c6"/>`;
  for (let col = 0; col < 3; col++) {
    const dx = 8 + col * (w - 15) / 3;
    output += `<path d="M${dx} ${ground + 3}q6-7 12 0v20h-12Z" fill="#516369" stroke="#b29a77" stroke-width="1.2"/><path d="M${dx + 6} ${ground + 2}v20" stroke="#d7c4a1" stroke-width=".7"/>`;
  }
  output += `<path d="M3 ${ground - 7}h${w - 6}l5 8H-2Z" fill="#f9edce" stroke="#c0ab88" stroke-width=".6"/>`;
  for (let stripe = 0; stripe < 8; stripe++) {
    const sx = 3 + stripe * (w - 6) / 8;
    if (stripe % 2 === 0) output += `<path d="M${sx} ${ground - 7}h${(w - 6) / 8}l1 8h-${(w - 6) / 8 + 1}Z" fill="${color}"/>`;
  }
  for (let scallop = 0; scallop < 8; scallop++) {
    const sx = -2 + scallop * (w + 4) / 8;
    output += `<path d="M${sx} ${ground + 1}h${(w + 4) / 8}q-${(w + 4) / 16} 5-${(w + 4) / 8} 0" fill="${scallop % 2 === 0 ? color : '#f7e7c6'}"/>`;
  }
  output += `<path d="M0 0H${w}M0 3H${w}" stroke="#fff3d8" stroke-width="2.5"/><path d="M0 ${h}H${w}" stroke="#a7977b" stroke-width="2"/></g>`;
  return output;
}

function adornment(agent, reduced) {
  const { x, y, h } = BUILDINGS[agent.id];
  const top = y - h - 44;
  if (agent.hasFailure || agent.status === 'failed') return `<g class="city-failure" aria-label="Unresolved incident"><circle class="${reduced ? '' : 'city-smoke city-smoke-one'}" cx="${x - 17}" cy="${top - 12}" r="9" fill="#77746d" opacity=".4"/><circle class="${reduced ? '' : 'city-smoke city-smoke-two'}" cx="${x - 11}" cy="${top - 25}" r="12" fill="#77746d" opacity=".25"/><path d="M${x + 19} ${top - 20}l10 18h-20Z" fill="#c78749" stroke="#f5e7ce" stroke-width="1.5"/><path d="M${x + 19} ${top - 14}v6m0 2v1" stroke="#fff6df" stroke-width="1.6"/></g>`;
  if (agent.status === 'review') return `<g aria-label="Awaiting approval"><path d="M${x} ${top + 12}v-23" stroke="#927246" stroke-width="1.5"/><circle cx="${x}" cy="${top - 16}" r="10" fill="#f3e4c4" stroke="#b17d39" stroke-width="1.8"/><path d="M${x} ${top - 22}v6l4 2" fill="none" stroke="#8e622e" stroke-width="1.6" stroke-linecap="round"/></g>`;
  if (agent.status === 'running') return `<g class="city-working-indicator" aria-label="Agent working"><path d="M${x} ${top + 10}v-15" stroke="#9b794a" stroke-width="1.3"/><path class="${reduced ? '' : 'city-flag'}" d="M${x} ${top - 9}q8-4 17 0v11q-9-4-17 0Z" fill="${BUILDINGS[agent.id].color}"/><circle cx="${x}" cy="${top - 11}" r="1.7" fill="#af813e"/></g>`;
  return '';
}

function worker(agent, reduced) {
  if (agent.status !== 'running') return '';
  const { x, y, d, color } = BUILDINGS[agent.id];
  const shape = `<ellipse cx="0" cy="3" rx="5" ry="2.2" fill="#6b705d" opacity=".15"/><circle cx="0" cy="-12" r="2.5" fill="#d4b391"/><path d="M0-9v7m0-5-4 4m4-4 4 3M0-2l-3 5m3-5 3 5" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/><rect x="3" y="-5" width="5" height="4" rx=".7" fill="#b28a54"/>`;
  return reduced ? `<g aria-hidden="true" transform="translate(${x - 23} ${y + d + 3})">${shape}</g>` : `<g class="city-worker" aria-hidden="true">${shape}<animateMotion dur="4.2s" repeatCount="indefinite" path="M${x - 55} ${y + d + 18}L${x - 20} ${y + d - 2}L${x - 17} ${y + d - 5}"/></g>`;
}

function agentBuilding(agent, selected, reduced) {
  const { x, y, w, d, h, color, number } = BUILDINGS[agent.id];
  const hasIncident = agent.hasFailure || agent.status === 'failed';
  const statusColor = hasIncident ? '#9b5540' : agent.status === 'review' ? '#a07134' : agent.status === 'running' ? color : '#65726a';
  const labelY = y + d + 24;
  const statusWidth = agent.status === 'review' ? 119 : agent.status === 'failed' ? 112 : 78;
  return `<g class="city-agent ${selected ? 'city-selected' : ''} ${agent.status === 'running' ? 'city-is-running' : ''}" data-agent-id="${agent.id}" role="button" tabindex="0" aria-pressed="${selected}" aria-label="${escape(agent.name)}. ${STATE_LABELS[agent.status]}. ${hasIncident ? 'Unresolved incident. ' : ''}${agent.successfulRuns} successful ${agent.successfulRuns === 1 ? 'run' : 'runs'}. View agent details." style="--agent-color:${color}">
    <title>${escape(agent.name)} · ${STATE_LABELS[agent.status]} · ${agent.successfulRuns} successful ${agent.successfulRuns === 1 ? 'run' : 'runs'}${hasIncident ? ' · Unresolved incident' : ''}</title>
    <path d="M${x - w - 3} ${y + 7}l${w + 30} ${d + 15} ${w + 55}-${d + 10}-${w + 29}-${d + 14}Z" fill="#6a6e57" opacity=".15"/>
    <path class="city-selection-pad" d="M${x} ${y - d - 9}l${w + 14} ${d + 9}-${w + 14} ${d + 9}-${w + 14}-${d + 9}Z" fill="${color}" fill-opacity=".025" stroke="${color}" stroke-opacity="${selected ? '.65' : '.15'}" stroke-width="1.3"/>
    <g class="city-architecture">${limestone(x, y, w, d, h)}${facade(agent, 0, w, d, h)}${facade(agent, 1, w, d, h)}${mansard(x, y - h, w + 3, d + 1.5, agent.id === 'followup' ? '#5e6c70' : '#536773', agent.id === 'booking')}
    ${agent.id === 'booking' ? `<g transform="translate(${x} ${y - h + d - 4})"><path d="M-15 1v-10q15-24 30 0V1Z" fill="#e9d8b6" stroke="#b29d7b"/><circle cy="-8" r="8" fill="#f8eed8" stroke="#8b764f" stroke-width="1"/><path d="M0-13v5l4 2" fill="none" stroke="#645a44" stroke-width="1.3"/></g>` : ''}
    </g>${adornment(agent, reduced)}${worker(agent, reduced)}
    <g class="city-agent-label" transform="translate(${x} ${labelY})">
      <rect class="city-nameplate" x="-101" y="-9" width="202" height="65" rx="9" fill="#fcf8ed" fill-opacity=".98" stroke="${selected ? color : '#d4c5ad'}" stroke-width="${selected ? 1.6 : 1}"/>
      <circle cx="-83" cy="7" r="8" fill="${color}" fill-opacity=".09"/><text x="-83" y="10" text-anchor="middle" fill="${color}" font-size="8" font-weight="600">${number}</text>
      <text x="8" y="11" text-anchor="middle" class="city-agent-name">${escape(cut(agent.name, 24))}</text>
      <rect x="${-statusWidth / 2}" y="20" width="${statusWidth}" height="17" rx="8.5" fill="${statusColor}" fill-opacity=".08"/><circle cx="${-statusWidth / 2 + 10}" cy="28.5" r="2.5" fill="${statusColor}"/><text x="5" y="32" text-anchor="middle" fill="${statusColor}" class="city-state-label">${STATE_LABELS[agent.status]}</text>
      <text y="49" text-anchor="middle" class="city-run-count">${agent.successfulRuns} successful ${agent.successfulRuns === 1 ? 'run' : 'runs'}</text>
    </g>
  </g>`;
}

function tree(x, y, size = 1) {
  return `<g transform="translate(${x} ${y}) scale(${size})" aria-hidden="true"><ellipse cy="3" rx="17" ry="7" fill="#536649" opacity=".12"/><path d="M0 1v-29m0 12-8-11m8 6 8-11" fill="none" stroke="#917856" stroke-width="3"/><ellipse cy="-34" rx="17" ry="21" fill="#899a70"/><ellipse cx="-7" cy="-34" rx="13" ry="16" fill="#a1af7d"/><ellipse cx="5" cy="-40" rx="10" ry="14" fill="#b2bc88"/><path d="M-8-33l5-3m10-8 3 4m-10 15 4-2" stroke="#d6d5a6" stroke-width="2" stroke-linecap="round" opacity=".45"/></g>`;
}
function lamp(x, y) {
  return `<g aria-hidden="true"><title>Decorative street lamp</title><ellipse cx="${x}" cy="${y + 1}" rx="7" ry="3" fill="#636952" opacity=".12"/><path d="M${x} ${y}v-38m-4 38h8m-6-4h4" stroke="#59615b" stroke-width="1.8" stroke-linecap="round"/><path d="M${x - 5} ${y - 48}h10l-2 11h-6Z" fill="#ead9a7" stroke="#59615b" stroke-width="1.3"/><path d="M${x - 7} ${y - 49}l7-5 7 5Z" fill="#58625c"/><circle cx="${x}" cy="${y - 56}" r="1.5" fill="#a48657"/></g>`;
}
function bridge(x, y, flip = 1) {
  return `<g transform="translate(${x} ${y}) scale(${flip} 1)" aria-hidden="true"><path d="M-10 0L24 19 70-14 35-34Z" fill="#e6d8ba" stroke="#b4a17b"/><path d="M24 19v13L70-1v-13Z" fill="#c7b38e" stroke="#ac9976"/><path d="M32 26v-8q7-12 14-8v6m7-5V3q6-11 12-8v7" fill="#a8beb0" stroke="#9c8969" stroke-width="1.5"/><path d="M-10-7L24 12 70-21M-10 0L24 19 70-14" fill="none" stroke="#d4c4a5" stroke-width="5"/><path d="M-8-7v8m10-2v8m10-2v8m10-2v8m10-7v8m10-15v8m10-15v8m10-15v8" stroke="#ae9b76" stroke-width="1"/></g>`;
}

function connectionPanel(connection) {
  const { x, y } = CONNECTIONS[connection.id];
  const color = BUILDINGS[CONNECTIONS[connection.id].agent].color;
  const fullFields = Object.entries(connection.fields).map(([key, value]) => `${key}: ${String(value)}`).join(' · ');
  const fullDescription = `${connection.label} · ${connection.value} · ${connection.detail} · ${connection.count} ${connection.countLabel} · ${connection.status} · ${connection.lastUpdate}${fullFields ? ' · ' + fullFields : ''}`;
  const valueLines = [];
  let line = '';
  for (const word of String(connection.value || 'Awaiting input').split(/\s+/)) {
    if ((line + ' ' + word).trim().length > 26 && line) { valueLines.push(line); line = word; }
    else line = (line + ' ' + word).trim();
  }
  if (line) valueLines.push(line);
  const symbols = {
    inbox: '<path d="M3 5h14v12H3Z"/><path d="M3 12h4l2 2h2l2-2h4M7 5V3h6v2"/>',
    knowledge: '<path d="M10 5Q4 1 2 4v13q4-2 8 1 4-3 8-1V4q-2-3-8 1v13"/>',
    calendar: '<rect x="3" y="4" width="14" height="14" rx="2"/><path d="M6 2v5m8-5v5M3 9h14m-10 4h2m3 0h2"/>',
    messages: '<path d="M2 4h16v11H8l-4 4v-4H2Z"/><path d="M6 8h8m-8 3h5"/>',
  };
  return `<g class="city-connection-panel ${connection.active ? 'city-connection-active' : ''}" data-connection-id="${connection.id}" role="group" aria-label="${escape(fullDescription)}">
    <title>${escape(fullDescription)}</title><rect x="${x}" y="${y + 3}" width="215" height="142" rx="13" fill="#b9a586" opacity=".07"/><rect x="${x}" y="${y}" width="215" height="142" rx="13" fill="#fcf9f1" stroke="${connection.active ? color : '#dacdb6'}" stroke-width="${connection.active ? 1.5 : 1}"/>
    <rect x="${x + 14}" y="${y + 14}" width="30" height="30" rx="8" fill="${color}" fill-opacity=".07"/><g transform="translate(${x + 19} ${y + 19})" fill="none" stroke="${color}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">${symbols[connection.id]}</g>
    <text x="${x + 53}" y="${y + 26}" class="city-connection-label">${escape(cut(connection.label, 19))}</text><text x="${x + 53}" y="${y + 40}" fill="#92846f" font-size="8.5" letter-spacing=".8">DATA CONNECTION</text><text x="${x + 192}" y="${y + 31}" text-anchor="end" fill="${color}" font-size="18" font-family="Georgia,serif">${escape(connection.count)}</text>
    ${valueLines.slice(0, 2).map((text, i) => `<text x="${x + 15}" y="${y + 65 + i * 17}" class="city-connection-value">${escape(cut(text, 27))}</text>`).join('')}
    <text x="${x + 15}" y="${y + 104}" class="city-connection-detail">${escape(cut(connection.detail, 34))}</text><path d="M${x + 15} ${y + 114}h185" stroke="#e7ddcb"/><circle cx="${x + 18}" cy="${y + 129}" r="2.5" fill="${connection.active ? color : '#9eaa91'}"/><text x="${x + 26}" y="${y + 132}" fill="#817462" font-size="8.5">${escape(cut(connection.status, 19))}</text><text x="${x + 199}" y="${y + 132}" text-anchor="end" fill="#a0937f" font-size="8">${escape(cut(connection.lastUpdate, 17))}</text>
  </g>`;
}

/** Re-render on event-store changes. Fountain ripples are decorative only. */
export function renderCity(container, { agents = [], selectedAgentId = null, activeAgentId = null, events = [], connections = [], reducedMotion, ambientMode = true, onSelect } = {}) {
  if (!container || typeof container.replaceChildren !== 'function') throw new TypeError('renderCity requires a DOM container.');
  const focusedElement = container.ownerDocument?.activeElement;
  const focusedAgentId = focusedElement && container.contains?.(focusedElement) ? focusedElement.closest?.('[data-agent-id]')?.dataset.agentId : null;
  instances.get(container)?.destroy();
  const uid = `parallax-quarter-${++cityInstance}`;
  const reduced = reducedMotion ?? (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const supplied = new Map((Array.isArray(agents) ? agents : []).filter(agent => BUILDINGS[agent.id]).map(agent => [agent.id, agent]));
  const normalized = Object.keys(BUILDINGS).map(id => {
    const input = supplied.get(id) || {};
    return { id, name: String(input.name || BUILDINGS[id].fallback), status: STATES.has(input.status) ? input.status : 'idle', hasFailure: input.hasFailure === true, successfulRuns: Number.isFinite(input.successfulRuns) ? Math.max(0, Math.floor(input.successfulRuns)) : 0 };
  });
  const suppliedConnections = new Map((Array.isArray(connections) ? connections : []).filter(item => CONNECTIONS[item.id]).map(item => [item.id, item]));
  const normalizedConnections = Object.keys(CONNECTIONS).map(id => {
    const source = suppliedConnections.get(id) || {};
    return { id, label: String(source.label || CONNECTIONS[id].label), value: String(source.value ?? 'Awaiting input'), detail: String(source.detail ?? 'No activity recorded yet'), status: String(source.status ?? 'Ready'), active: source.active === true, count: Number.isFinite(source.count) ? Math.max(0, Math.floor(source.count)) : 0, lastUpdate: String(source.lastUpdate ?? 'Not yet updated'), countLabel: String(source.countLabel ?? 'events'), fields: source.fields && typeof source.fields === 'object' && !Array.isArray(source.fields) ? source.fields : {} };
  });
  const active = normalized.find(agent => agent.id === activeAgentId && agent.status === 'running');
  const eventCount = Array.isArray(events) ? events.length : 0;
  const runningCount = normalized.filter(agent => agent.status === 'running').length;
  const activeRoute = active ? (active.id === 'response' ? 'M420 430 L500 476 L582 429' : active.id === 'booking' ? 'M582 326 L650 368 L582 429' : 'M748 430 L664 478 L582 429') : null;

  container.innerHTML = `<svg class="autocraft-city parallax-city ${reduced ? 'city-reduced-motion' : ''}" viewBox="0 0 1160 740" xmlns="http://www.w3.org/2000/svg" role="group" aria-labelledby="${uid}-title ${uid}-description" preserveAspectRatio="xMidYMid meet">
    <title id="${uid}-title">The agent quarter</title><desc id="${uid}-description">Three interactive agent buildings in a Paris-inspired square. Select a building for its activity. Windows animate while an agent works, and remain warm after successful runs. Smoke means an unresolved incident, including during retries. Four outside panels show current connection data. Moving couriers and route signals are driven by active events. Fountain ripples and street lamps are decorative.</desc>
    <defs>
      <linearGradient id="${uid}-daylight" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f8f4e9"/><stop offset=".65" stop-color="#f2eddf"/><stop offset="1" stop-color="#eee3cc"/></linearGradient>
      <linearGradient id="${uid}-river" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#b8c9b9"/><stop offset="1" stop-color="#93b2a4"/></linearGradient>
      <pattern id="${uid}-cobbles" width="24" height="16" patternUnits="userSpaceOnUse"><path d="M0 0h24M0 8h24M0 16h24M0 0v8m12 0v8m12-16v8" fill="none" stroke="#a39171" stroke-opacity=".15" stroke-width=".6"/></pattern>
      <pattern id="${uid}-river-lines" width="80" height="35" patternUnits="userSpaceOnUse"><path d="M6 18q9-4 18 0t18 0m10-12 15-1" fill="none" stroke="#e1e9d8" stroke-opacity=".45" stroke-width="1"/></pattern><clipPath id="${uid}-land"><path d="M582 174L905 390 582 620 255 404Z"/></clipPath>
    </defs>
    <style>
      .autocraft-city{display:block;width:100%;height:auto;min-height:280px;overflow:visible;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;isolation:isolate}.autocraft-city text{pointer-events:none;user-select:none}.city-agent{cursor:pointer;outline:none;-webkit-tap-highlight-color:transparent}.city-architecture{transition:filter .18s}.city-agent:hover .city-architecture,.city-agent:focus-visible .city-architecture{filter:brightness(1.045)}
      .city-selection-pad{transition:fill-opacity .18s,stroke-opacity .18s}.city-agent:hover .city-selection-pad,.city-agent:focus-visible .city-selection-pad,.city-selected .city-selection-pad{fill-opacity:.08;stroke-opacity:.8;stroke-width:2}.city-agent:focus-visible .city-nameplate{stroke:var(--agent-color);stroke-width:3}.city-agent-name{fill:#303f41;font-size:12px;font-weight:600;letter-spacing:.04px}.city-state-label{font-size:9px;font-weight:500}.city-run-count{fill:#8c7e69;font-size:9px;font-variant-numeric:tabular-nums}.city-connection-label{fill:#48514c;font-size:12px;font-weight:600}.city-connection-value{fill:#384a4e;font-size:13px;font-weight:500}.city-connection-detail{fill:#8e816f;font-size:9px}
      .city-window-active{animation:quarter-window 1.9s ease-in-out infinite}.city-flag{animation:quarter-flag 2.3s ease-in-out infinite;transform-box:fill-box;transform-origin:left center}.city-fountain-ripple{animation:quarter-ripple 3.6s ease-out infinite;transform-box:fill-box;transform-origin:center}.city-smoke{animation:quarter-smoke 3.2s ease-out infinite;transform-box:fill-box;transform-origin:center}.city-smoke-two{animation-delay:-1.6s}
      @keyframes quarter-window{0%,24%,100%{fill:#74898a;opacity:.82}40%,72%{fill:#ffe3a1;opacity:1}88%{fill:#9c9d83;opacity:.88}}@keyframes quarter-flag{0%,100%{transform:skewY(-2deg)}50%{transform:skewY(4deg)}}@keyframes quarter-ripple{0%{transform:scale(.5);opacity:.55}100%{transform:scale(1.12);opacity:0}}@keyframes quarter-smoke{0%{transform:translate(0,4px) scale(.8);opacity:.2}50%{opacity:.4}100%{transform:translate(8px,-22px) scale(1.4);opacity:0}}.city-reduced-motion *{animation:none!important;transition:none!important}@media(prefers-reduced-motion:reduce){.autocraft-city *{animation:none!important;transition:none!important}.city-motion-packet,.city-worker{display:none}}
    </style>
    <rect width="1160" height="740" rx="20" fill="url(#${uid}-daylight)"/><ellipse cx="582" cy="549" rx="355" ry="132" fill="#8e8264" opacity=".055"/>
    <g aria-hidden="true"><path d="M239 410L582 640 921 410v61L582 702 239 471Z" fill="#8aab9c"/><path d="M239 404L582 634 921 404v61L582 696 239 465Z" fill="url(#${uid}-river)"/><path d="M239 404L582 634 921 404v61L582 696 239 465Z" fill="url(#${uid}-river-lines)"/><path d="M239 469L582 700 921 469v10L582 710 239 479Z" fill="#d6c6a6"/><path d="M245 474L582 701 915 474" fill="none" stroke="#e9ddc6" stroke-width="4"/></g>
    <path d="M255 404L582 620 905 390v14L582 635 255 418Z" fill="#c6b597" stroke="#b7a484" stroke-width="1"/><path d="M582 174L905 390 582 620 255 404Z" fill="#e8dfca" stroke="#c5b494" stroke-width="1"/><path d="M582 184L889 390 582 607 270 404Z" fill="url(#${uid}-cobbles)" stroke="#f6edd9" stroke-width="8"/>
    <g clip-path="url(#${uid}-land)" fill="none"><path d="M292 404L582 596 872 390 582 196Z" stroke="#d3c6ad" stroke-width="27"/><path d="M292 404L582 596 872 390 582 196Z" stroke="#eae2ce" stroke-width="21"/><path d="M415 302L750 526M418 519L745 302" stroke="#ccbda1" stroke-width="34"/><path d="M415 302L750 526M418 519L745 302" stroke="#e4d8bf" stroke-width="29"/><path d="M415 302L750 526M418 519L745 302" stroke="#a48e6d" stroke-width=".7" stroke-dasharray="1 9"/></g>
    <path d="M582 382l125 83-125 86-126-84Z" fill="#d0d0ae" stroke="#bac099" stroke-width="1"/><path d="M582 397l104 68-104 71-105-69Z" fill="#e9e1c9" stroke="#f8efdb" stroke-width="7"/><g fill="none" stroke="#9b8668" stroke-opacity=".23" stroke-width="1"><path d="M582 407v119M490 467h186M527 432l111 70m-111 0 111-70"/></g>
    <g class="city-connection-routes" fill="none" stroke-linecap="round">${normalizedConnections.map(connection => `<path d="${CONNECTIONS[connection.id].route}" stroke="${BUILDINGS[CONNECTIONS[connection.id].agent].color}" stroke-width="${connection.active ? 1.9 : 1.1}" stroke-opacity="${connection.active ? '.62' : '.19'}" stroke-dasharray="${connection.active ? '3 5' : '2 6'}"/>`).join('')}</g>
    ${activeRoute ? `<path d="${activeRoute}" fill="none" stroke="${BUILDINGS[active.id].color}" stroke-opacity=".3" stroke-width="1.5" stroke-dasharray="3 6"/>` : ''}
    ${tree(331, 391, .78)}${tree(344, 403, .65)}${tree(660, 273, .82)}${tree(680, 285, .73)}${tree(827, 398, .83)}${tree(843, 410, .66)}${tree(478, 554, .71)}${tree(691, 555, .72)}
    ${lamp(479, 331)}${lamp(688, 334)}${lamp(346, 457)}${lamp(820, 456)}
    ${agentBuilding(normalized[1], selectedAgentId === 'booking', reduced)}${agentBuilding(normalized[0], selectedAgentId === 'response', reduced)}${agentBuilding(normalized[2], selectedAgentId === 'followup', reduced)}
    <g class="city-monitor" role="group" aria-label="Activity square: ${eventCount} recorded events, ${runningCount} working agents. Decorative fountain."><title>Activity square · ${eventCount} recorded events · Fountain is decorative</title><ellipse cx="582" cy="489" rx="49" ry="26" fill="#b2a38a" opacity=".18"/><ellipse cx="582" cy="484" rx="43" ry="23" fill="#bcad8d"/><path d="M539 480v6a43 23 0 0 0 86 0v-6" fill="#d1c2a0" stroke="#b6a584"/><ellipse cx="582" cy="480" rx="43" ry="23" fill="#e9ddbd" stroke="#b9a783"/><ellipse cx="582" cy="480" rx="35" ry="17" fill="#aec7b5"/><ellipse class="${!reduced && ambientMode ? 'city-fountain-ripple' : ''}" cx="582" cy="480" rx="29" ry="13" fill="none" stroke="#eaf1db" stroke-width="1.4" opacity=".6"/><path d="M578 479v-21h8v21" fill="#c9b58e" stroke="#a9946f"/><ellipse cx="582" cy="457" rx="18" ry="8" fill="#ded0ae" stroke="#b7a17a"/><ellipse cx="582" cy="455" rx="16" ry="6" fill="#b7cbb7"/><path d="M582 455v-18" stroke="#c0b087" stroke-width="4"/><circle cx="582" cy="435" r="4" fill="#d5c39c"/><path d="M582 438q-9-2-10 16m10-16q9-2 10 16" fill="none" stroke="#e6edce" stroke-width="1.5" opacity=".8"/><text x="582" y="531" text-anchor="middle" fill="#61705f" font-family="Georgia,serif" font-size="13">Activity square</text><text x="582" y="546" text-anchor="middle" fill="#95846a" font-size="8.5">${eventCount} recorded ${eventCount === 1 ? 'event' : 'events'}</text></g>
    <g aria-hidden="true"><g transform="translate(509 470) rotate(34)"><rect x="-17" y="-4" width="34" height="7" rx="2" fill="#a68558"/><path d="M-17-6h34m-29 10v6m24-6v6" stroke="#59614d" stroke-width="2"/></g><g transform="translate(655 470) rotate(-34)"><rect x="-17" y="-4" width="34" height="7" rx="2" fill="#a68558"/><path d="M-17-6h34m-29 10v6m24-6v6" stroke="#59614d" stroke-width="2"/></g></g>
    ${bridge(510, 622, -1)}${bridge(652, 622, 1)}<g aria-hidden="true" transform="translate(582 667)"><path d="M-9 0q9 10 18 0l-3 9h-12Z" fill="#8b684d"/><path d="M0 0v-16l10 13H0" fill="#eee3bf" stroke="#aa9671" stroke-width=".7"/></g>
    ${normalizedConnections.filter(connection => connection.active).map(connection => { const route = CONNECTIONS[connection.id].route; const color = BUILDINGS[CONNECTIONS[connection.id].agent].color; return reduced ? '' : `<g class="city-motion-packet" aria-hidden="true"><circle r="6" fill="#faf0d7" stroke="${color}" stroke-width="1"/><rect x="-3" y="-2" width="6" height="4" rx=".5" fill="none" stroke="${color}" stroke-width=".7"/><path d="M-3-2l3 2 3-2" fill="none" stroke="${color}" stroke-width=".7"/><animateMotion dur="1.6s" repeatCount="indefinite" path="${route}"/></g>`; }).join('')}
    ${activeRoute && !reduced ? `<g class="city-motion-packet" aria-hidden="true"><circle r="3.5" fill="#b08445" stroke="#fff5dc" stroke-width="1.5"/><animateMotion dur="1.8s" repeatCount="indefinite" path="${activeRoute}"/></g>` : ''}
    ${normalizedConnections.map(connectionPanel).join('')}
    <g aria-hidden="true" transform="translate(0 -30)"><path d="M504 89h38m80 0h38" stroke="#b8a37f" stroke-width=".8"/><path d="M576 89l6-5 6 5-6 5Z" fill="#ad8855" fill-opacity=".5"/><text x="582" y="113" text-anchor="middle" font-family="Georgia,serif" font-size="16" letter-spacing="2" fill="#87714f">THE AGENT QUARTER</text><text x="582" y="132" text-anchor="middle" fill="#ab9c82" font-size="8.5" letter-spacing="1.6">ONE CONNECTED NEIGHBORHOOD</text></g>
  </svg>`;
  const svg = container.querySelector('svg');
  function select(event) {
    const element = event.target.closest('[data-agent-id]');
    if (!element || !svg.contains(element)) return;
    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
    if (event.type === 'keydown') event.preventDefault();
    onSelect?.(element.dataset.agentId);
  }
  svg.addEventListener('click', select);
  svg.addEventListener('keydown', select);
  if (focusedAgentId && BUILDINGS[focusedAgentId]) svg.querySelector(`[data-agent-id="${focusedAgentId}"]`)?.focus({ preventScroll: true });
  const instance = { svg, destroy() { svg.removeEventListener('click', select); svg.removeEventListener('keydown', select); if (instances.get(container) === instance) instances.delete(container); } };
  instances.set(container, instance);
  return instance;
}
