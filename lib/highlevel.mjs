/** Read-only, server-side HighLevel workflow inventory and execution-log observer. */

const API_ORIGIN = 'https://services.leadconnectorhq.com';
const LOCATION_ID = '5zqOysfDkN78JkEsL5iX';
const DAY_MS = 24 * 60 * 60 * 1000;
const ELIGIBILITY_CODE = 'WORKFLOW_API_NOT_ENABLED_FOR_LOCATION';

export const WORKFLOW_CONFIG = Object.freeze([
  Object.freeze({ agentId: 'response', id: '52f7f31f-700d-4cfe-b146-74f1d5e311ba', name: 'SEO Audit — Paige Lead Intake', shortName: 'Lead intake' }),
  Object.freeze({ agentId: 'booking', id: 'f4abb9d9-26a1-4581-b184-5c66cceab44a', name: 'SMB Nurture - Exit on Appointment Booked', shortName: 'Booking stop' }),
  Object.freeze({ agentId: 'followup', id: '89c02506-33fd-4558-8eae-20474e19fa2c', name: 'SMB AI Growth Nurture', shortName: 'Lead nurture' }),
]);

const RESPONSE_HEADERS = Object.freeze({
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
});

const ISSUES = Object.freeze({
  AUTHENTICATION_REQUIRED: 'Sign in to view the connected workspace.',
  CONFIGURATION_REQUIRED: 'The HighLevel connection is not configured for this workspace.',
  [ELIGIBILITY_CODE]: 'HighLevel workflow inventory is connected. Execution logs are not enabled for this location.',
  HIGHLEVEL_UNAVAILABLE: 'HighLevel could not complete this read. Try again shortly.',
  HIGHLEVEL_ACCESS_DENIED: 'HighLevel did not authorize this read. Check the integration access.',
  HIGHLEVEL_RATE_LIMITED: 'HighLevel is limiting requests. Try again shortly.',
  HIGHLEVEL_TIMEOUT: 'The HighLevel read timed out. No partial activity is displayed.',
  INCOMPLETE_ACTIVITY: 'The activity window could not be read completely. No partial activity is displayed.',
  UNEXPECTED_SOURCE_RESPONSE: 'HighLevel returned an unexpected response. No unverified activity is displayed.',
  CONFIGURED_WORKFLOW_MISSING: 'A configured workflow was not returned by HighLevel.',
  METHOD_NOT_ALLOWED: 'Use GET to read this workspace.',
});

class ReadError extends Error {
  constructor(code) { super(code); this.code = code; }
}

const issue = code => ({ code, message: ISSUES[code] || ISSUES.HIGHLEVEL_UNAVAILABLE });
const dateString = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,150}$/.test(value);
const text = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200) : '';
const safeType = value => typeof value === 'string' && /^[a-z][a-z0-9_.-]{0,79}$/i.test(value) ? value : 'other';

const KNOWN_STATUSES = new Set([
  'added_to_workflow', 'success', 'error', 'failed', 'failed_retry_limit_reached',
  'retry', 'skipped', 'waiting', 'wait_finished', 'finished', 'paused_due_to_draft_mode',
  'contact_merged', 'drip_queued', 'drip_resume', 'processing', 'winner_declared',
]);
const FAILED = new Set(['error', 'failed', 'failed_retry_limit_reached']);
const WAITING = new Set(['waiting', 'drip_queued', 'paused_due_to_draft_mode', 'retry']);

function eligibilityError(payload) {
  return [payload?.code, payload?.error, payload?.message, payload?.error?.code]
    .some(value => typeof value === 'string' && value.includes(ELIGIBILITY_CODE));
}

function remainingTime(context) {
  const remaining = context.deadline - context.clock();
  if (remaining <= 0) throw new ReadError('HIGHLEVEL_TIMEOUT');
  return Math.min(remaining, context.requestTimeoutMs);
}

async function fetchJson(path, query, context) {
  const url = new URL(path, API_ORIGIN);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
  const timeoutMs = remainingTime(context);
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ReadError('HIGHLEVEL_TIMEOUT'));
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      (async () => {
        let response;
        try {
          response = await context.fetchImpl(url.toString(), {
            method: 'GET', headers: { Authorization: `Bearer ${context.token}`, Version: 'v3', Accept: 'application/json' },
            signal: controller.signal, cache: 'no-store', redirect: 'error',
          });
        } catch {
          throw new ReadError(controller.signal.aborted ? 'HIGHLEVEL_TIMEOUT' : 'HIGHLEVEL_UNAVAILABLE');
        }
        let payload;
        try { payload = await response.json(); }
        catch { throw new ReadError(response.ok ? 'UNEXPECTED_SOURCE_RESPONSE' : 'HIGHLEVEL_UNAVAILABLE'); }
        if (!response.ok) {
          if (response.status === 403 && eligibilityError(payload)) throw new ReadError(ELIGIBILITY_CODE);
          if (response.status === 401 || response.status === 403) throw new ReadError('HIGHLEVEL_ACCESS_DENIED');
          if (response.status === 429) throw new ReadError('HIGHLEVEL_RATE_LIMITED');
          throw new ReadError('HIGHLEVEL_UNAVAILABLE');
        }
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new ReadError('UNEXPECTED_SOURCE_RESPONSE');
        return payload;
      })(),
      timeout,
    ]);
  } finally { clearTimeout(timer); }
}

function workflowInventory(payload, locationId) {
  if (!Array.isArray(payload.workflows)) throw new ReadError('UNEXPECTED_SOURCE_RESPONSE');
  const result = WORKFLOW_CONFIG.map(config => {
    const matches = payload.workflows.filter(workflow => workflow?.id === config.id);
    if (matches.length > 1) throw new ReadError('UNEXPECTED_SOURCE_RESPONSE');
    const source = matches[0];
    if (source?.locationId && source.locationId !== locationId) throw new ReadError('UNEXPECTED_SOURCE_RESPONSE');
    if (source && (!text(source.name) || !text(source.status))) throw new ReadError('UNEXPECTED_SOURCE_RESPONSE');
    return {
      ...config, name: source ? text(source.name) : config.name,
      status: source ? text(source.status) : 'not_found', updatedAt: source ? dateString(source.updatedAt) : null,
      activity: null,
    };
  });
  return result;
}

function normalizeLog(source, workflowId, context) {
  if (!source || source.locationId !== context.locationId || source.workflowId !== workflowId ||
      !identifier(source.id) || typeof source.status !== 'string' || typeof source.type !== 'string') {
    throw new ReadError('UNEXPECTED_SOURCE_RESPONSE');
  }
  const timestamp = dateString(source.createdAt);
  if (!timestamp) throw new ReadError('UNEXPECTED_SOURCE_RESPONSE');
  const happenedAt = Date.parse(timestamp);
  if (happenedAt < context.windowStartMs || happenedAt > context.windowEndMs) throw new ReadError('UNEXPECTED_SOURCE_RESPONSE');
  if (source.workflowStatusId && !identifier(source.workflowStatusId)) throw new ReadError('UNEXPECTED_SOURCE_RESPONSE');
  return {
    id: source.id,
    executionId: source.workflowStatusId || null,
    status: KNOWN_STATUSES.has(source.status) ? source.status : 'other',
    type: safeType(source.type), timestamp,
    // This internal evidence flag is removed before events leave the server.
    endedNormally: source.status === 'finished' && source.meta?.removedFrom?.type === 'end_of_workflow',
  };
}

async function readLogs(workflowId, context) {
  let cursor = null;
  const seenCursors = new Set();
  const records = new Map();
  for (let page = 0; page < context.maxPages; page += 1) {
    const query = {
      locationId: context.locationId, limit: 100, action: cursor ? 'next' : 'first',
      startDate: new Date(context.windowStartMs).toISOString(), endDate: new Date(context.windowEndMs).toISOString(),
      ...(cursor ? { referenceId: cursor.referenceId, referenceCreatedAt: cursor.referenceCreatedAt } : {}),
    };
    const payload = await fetchJson(`/workflows/${workflowId}/logs`, query, context);
    if (!Array.isArray(payload.logs) || payload.logs.length > 100 || payload.count !== payload.logs.length ||
        !Object.hasOwn(payload, 'nextCursor')) throw new ReadError('UNEXPECTED_SOURCE_RESPONSE');
    for (const source of payload.logs) {
      const record = normalizeLog(source, workflowId, context);
      if (!records.has(record.id)) records.set(record.id, record);
    }
    if (payload.nextCursor === null) return [...records.values()];
    cursor = payload.nextCursor;
    if (!cursor || !identifier(cursor.referenceId) || !dateString(cursor.referenceCreatedAt)) throw new ReadError('UNEXPECTED_SOURCE_RESPONSE');
    const key = `${cursor.referenceId}\n${cursor.referenceCreatedAt}`;
    if (seenCursors.has(key)) throw new ReadError('INCOMPLETE_ACTIVITY');
    seenCursors.add(key);
  }
  throw new ReadError('INCOMPLETE_ACTIVITY');
}

export function projectWorkflowActivity(records) {
  // Stable sorting retains the source's newest-first order when timestamps tie.
  const ordered = [...records].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  const latestExecutions = new Map();
  for (const record of ordered) if (record.executionId && !latestExecutions.has(record.executionId)) latestExecutions.set(record.executionId, record);
  const latest = [...latestExecutions.values()];
  const working = latest.filter(record => record.status === 'processing');
  return {
    runs: latest.length,
    completed: latest.filter(record => record.endedNormally).length,
    failed: latest.filter(record => FAILED.has(record.status)).length,
    working: working.length,
    waiting: latest.filter(record => WAITING.has(record.status)).length,
    lastEventAt: ordered[0]?.timestamp || null,
    lastWorkingEventAt: working[0]?.timestamp || null,
    events: ordered.map(({ id, executionId, status, type, timestamp }) => ({ id, executionId, status, type, timestamp })),
  };
}

/** A whole-window read. No process/browser cache is used as a source of truth. */
export async function readHighLevelSnapshot({
  token, locationId, fetchImpl = globalThis.fetch, now = Date.now, clock = Date.now,
  maxPages = 20, requestTimeoutMs = 6000, snapshotTimeoutMs = 20000,
}) {
  const windowEndMs = now();
  const checkedAt = new Date(windowEndMs).toISOString();
  const base = {
    connected: false, checkedAt, location: { name: 'Autocraft Studios' }, workflows: [],
    activityStatus: 'unavailable', source: 'highlevel-workflow-logs',
    windowStart: new Date(windowEndMs - DAY_MS).toISOString(), windowEnd: checkedAt,
  };
  const context = {
    token, locationId, fetchImpl, clock, maxPages, requestTimeoutMs,
    deadline: clock() + snapshotTimeoutMs, windowStartMs: windowEndMs - DAY_MS, windowEndMs,
  };
  try {
    const inventory = await fetchJson('/workflows/', { locationId }, context);
    const workflows = workflowInventory(inventory, locationId);
    base.connected = true;
    base.workflows = workflows;
    if (workflows.some(workflow => workflow.status === 'not_found')) throw new ReadError('CONFIGURED_WORKFLOW_MISSING');
    const activities = [];
    // Sequential reads stop immediately on the account-wide eligibility error.
    for (const workflow of workflows) activities.push(projectWorkflowActivity(await readLogs(workflow.id, context)));
    return {
      status: 200,
      body: { ...base, activityStatus: 'available', workflows: workflows.map((workflow, index) => ({ ...workflow, activity: activities[index] })), issue: null },
    };
  } catch (error) {
    const code = error instanceof ReadError ? error.code : 'HIGHLEVEL_UNAVAILABLE';
    return {
      status: base.connected && code === ELIGIBILITY_CODE ? 200 : 503,
      body: { ...base, issue: issue(code) },
    };
  }
}

export function createHighLevelHandler({ requireSession, env = process.env, ...readerOptions }) {
  return async request => {
    let authorized = false;
    try { authorized = await requireSession(request); } catch { /* fail closed */ }
    if (authorized !== true) return Response.json({ connected: false, activityStatus: 'unavailable', issue: issue('AUTHENTICATION_REQUIRED') }, { status: 401, headers: RESPONSE_HEADERS });
    if (request.method !== 'GET') return Response.json({ issue: issue('METHOD_NOT_ALLOWED') }, { status: 405, headers: { ...RESPONSE_HEADERS, Allow: 'GET' } });
    const token = typeof env.GHL_PRIVATE_INTEGRATION_TOKEN === 'string' ? env.GHL_PRIVATE_INTEGRATION_TOKEN.trim() : '';
    const locationId = typeof env.GHL_LOCATION_ID === 'string' ? env.GHL_LOCATION_ID.trim() : '';
    if (!token || locationId !== LOCATION_ID) return Response.json({ connected: false, activityStatus: 'unavailable', issue: issue('CONFIGURATION_REQUIRED') }, { status: 503, headers: RESPONSE_HEADERS });
    const result = await readHighLevelSnapshot({ ...readerOptions, token, locationId });
    return Response.json(result.body, { status: result.status, headers: RESPONSE_HEADERS });
  };
}
