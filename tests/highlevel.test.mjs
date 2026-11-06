import test from 'node:test';
import assert from 'node:assert/strict';
import { WORKFLOW_CONFIG, createHighLevelHandler } from '../lib/highlevel.mjs';

const LOCATION = '5zqOysfDkN78JkEsL5iX';
const FIXED_NOW = Date.parse('2026-11-05T18:00:00.000Z');
const ENV = { GHL_LOCATION_ID: LOCATION, GHL_PRIVATE_INTEGRATION_TOKEN: 'synthetic-test-secret' };
const request = () => new Request('https://example.test/api/highlevel?locationId=another-location&workflowId=unapproved');
const json = (body, status = 200) => Response.json(body, { status });
const inventory = () => ({ workflows: [
  ...WORKFLOW_CONFIG.map(workflow => ({ id: workflow.id, name: workflow.name, status: 'published', locationId: LOCATION, updatedAt: '2026-11-01T12:00:00.000Z' })),
  { id: 'unapproved', name: 'Never return this unrelated workflow', status: 'published', locationId: LOCATION },
] });
const page = (logs = [], nextCursor = null) => ({ logs, count: logs.length, nextCursor });
const log = (workflow, id, executionId, status, minute, extra = {}) => ({
  id, workflowId: workflow.id, locationId: LOCATION, workflowStatusId: executionId,
  status, type: 'email', createdAt: `2026-11-05T17:${String(minute).padStart(2, '0')}:00.000Z`,
  contactName: 'Private person', contactEmail: 'private@example.test', contactId: 'private-contact',
  recordPrimaryProperty: 'Private record', meta: { msg: 'Private provider details' }, ...extra,
});
const handler = (fetchImpl, options = {}) => createHighLevelHandler({ requireSession: () => true, env: ENV, now: () => FIXED_NOW, fetchImpl, ...options });

test('unauthenticated and unconfigured requests fail closed without contacting HighLevel', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error('must not fetch'); };
  const denied = await handler(fetchImpl, { requireSession: () => false })(request());
  assert.equal(denied.status, 401);
  const missing = await handler(fetchImpl, { env: {} })(request());
  assert.equal(missing.status, 503);
  assert.equal((await missing.json()).issue.code, 'CONFIGURATION_REQUIRED');
  const wrongLocation = await handler(fetchImpl, { env: { ...ENV, GHL_LOCATION_ID: 'other-location' } })(request());
  assert.equal(wrongLocation.status, 503);
  assert.equal(calls, 0);
  assert.equal(denied.headers.get('Cache-Control'), 'no-store');
});

test('known eligibility denial returns connected inventory with unknown activity and stops further reads', async () => {
  const calls = [];
  const response = await handler(async (url, options) => {
    calls.push({ url: new URL(url), options });
    if (calls.length === 1) return json(inventory());
    return json({ error: 'WORKFLOW_API_NOT_ENABLED_FOR_LOCATION', message: 'Private upstream diagnostic' }, 403);
  })(request());
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.connected, true);
  assert.equal(body.activityStatus, 'unavailable');
  assert.equal(body.issue.code, 'WORKFLOW_API_NOT_ENABLED_FOR_LOCATION');
  assert.equal(body.workflows.length, 3);
  assert.ok(body.workflows.every(workflow => workflow.activity === null && workflow.status === 'published'));
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.options.method === 'GET' && call.options.headers.Version === 'v3' && call.url.searchParams.get('locationId') === LOCATION));
  assert.ok(calls[1].url.pathname.includes(WORKFLOW_CONFIG[0].id));
  assert.ok(!JSON.stringify(body).includes('Private upstream'));
  assert.ok(!JSON.stringify(body).includes(ENV.GHL_PRIVATE_INTEGRATION_TOKEN));
});

test('complete pages deduplicate records, correlate executions, and never equate a successful step with a completed workflow', async () => {
  const workflow = WORKFLOW_CONFIG[0];
  const completed = log(workflow, 'log-complete', 'execution-complete', 'finished', 59, { meta: { removedFrom: { type: 'end_of_workflow' } } });
  const success = log(workflow, 'log-success', 'execution-step-only', 'success', 58);
  const failed = log(workflow, 'log-failed', 'execution-failed', 'failed', 57);
  const waiting = log(workflow, 'log-waiting', 'execution-waiting', 'waiting', 56);
  const processing = log(workflow, 'log-processing', 'execution-processing', 'processing', 55);
  const goal = log(workflow, 'log-goal', 'execution-exited', 'finished', 54, { meta: { removedFrom: { type: 'goal_action' } } });
  const first = [completed, success, failed, waiting];
  const second = [waiting, processing, goal, log(workflow, 'log-older-error', 'execution-step-only', 'error', 10), log(workflow, 'log-unlinked', '', 'winner_declared', 9)];
  const calls = [];
  const response = await handler(async (url, options) => {
    const parsed = new URL(url); calls.push({ parsed, options });
    if (parsed.pathname === '/workflows/') return json(inventory());
    if (parsed.pathname.includes(workflow.id)) return parsed.searchParams.get('action') === 'first'
      ? json(page(first, { referenceId: 'next-page', referenceCreatedAt: '2026-11-05T17:56:00.000Z' }))
      : json(page(second));
    return json(page());
  })(request());
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.activityStatus, 'available');
  const activity = body.workflows[0].activity;
  assert.equal(activity.runs, 6);
  assert.equal(activity.completed, 1);
  assert.equal(activity.failed, 1);
  assert.equal(activity.working, 1);
  assert.equal(activity.waiting, 1);
  assert.equal(activity.events.length, 8);
  assert.equal(activity.lastEventAt, completed.createdAt);
  assert.equal(body.workflows[1].activity.runs, 0);
  assert.deepEqual(Object.keys(activity.events[0]).sort(), ['executionId', 'id', 'status', 'timestamp', 'type']);
  const serialized = JSON.stringify(body);
  for (const secret of ['Private person', 'private@example.test', 'private-contact', 'Private provider details', 'Never return']) assert.ok(!serialized.includes(secret));
  const logCalls = calls.filter(call => call.parsed.pathname.endsWith('/logs'));
  assert.ok(logCalls.every(call => call.parsed.searchParams.get('startDate') === '2026-11-04T18:00:00.000Z' && call.parsed.searchParams.get('endDate') === '2026-11-05T18:00:00.000Z'));
  assert.equal(logCalls[1].parsed.searchParams.get('referenceId'), 'next-page');
  assert.equal(logCalls[1].parsed.searchParams.get('referenceCreatedAt'), '2026-11-05T17:56:00.000Z');
});

test('a failed later workflow discards all partial activity while keeping live inventory evidence', async () => {
  const response = await handler(async url => {
    const path = new URL(url).pathname;
    if (path === '/workflows/') return json(inventory());
    if (path.includes(WORKFLOW_CONFIG[0].id)) return json(page([log(WORKFLOW_CONFIG[0], 'accepted', 'observed', 'processing', 50)]));
    return json({ message: 'sensitive server error' }, 500);
  })(request());
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.connected, true);
  assert.ok(body.workflows.every(workflow => workflow.activity === null));
  assert.equal(body.activityStatus, 'unavailable');
  assert.ok(!JSON.stringify(body).includes('sensitive server error'));
});

test('a fresh completion cannot make a different execution’s old processing record appear fresh', async () => {
  const oldProcessing = log(WORKFLOW_CONFIG[0], 'old-processing', 'execution-a', 'processing', 5);
  const freshCompletion = log(WORKFLOW_CONFIG[0], 'fresh-completion', 'execution-b', 'finished', 59, { meta: { removedFrom: { type: 'end_of_workflow' } } });
  const response = await handler(async url => {
    if (new URL(url).pathname === '/workflows/') return json(inventory());
    if (url.includes(WORKFLOW_CONFIG[0].id)) return json(page([freshCompletion, oldProcessing]));
    if (url.includes(WORKFLOW_CONFIG[1].id)) return json(page([
      log(WORKFLOW_CONFIG[1], 'same-run-finished', 'execution-c', 'finished', 58, { meta: { removedFrom: { type: 'end_of_workflow' } } }),
      log(WORKFLOW_CONFIG[1], 'same-run-processing', 'execution-c', 'processing', 4),
    ]));
    return json(page());
  })(request());
  const body = await response.json();
  assert.equal(response.status, 200);
  const mixed = body.workflows[0].activity;
  assert.equal(mixed.working, 1);
  assert.equal(mixed.completed, 1);
  assert.equal(mixed.lastEventAt, freshCompletion.createdAt);
  assert.equal(mixed.lastWorkingEventAt, oldProcessing.createdAt);
  assert.equal(body.workflows[1].activity.working, 0);
  assert.equal(body.workflows[1].activity.lastWorkingEventAt, null);
  assert.equal(body.workflows[2].activity.lastWorkingEventAt, null);
});

test('cursor cycles and page exhaustion cannot look like a complete empty activity window', async () => {
  for (const maxPages of [1, 4]) {
    const response = await handler(async url => new URL(url).pathname === '/workflows/'
      ? json(inventory())
      : json(page([], { referenceId: 'loop-cursor', referenceCreatedAt: '2026-11-05T17:00:00.000Z' })), { maxPages })(request());
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.issue.code, 'INCOMPLETE_ACTIVITY');
    assert.ok(body.workflows.every(workflow => workflow.activity === null));
  }
});

test('records from another location or workflow are rejected rather than projected', async () => {
  for (const alteration of [{ locationId: 'another-location' }, { workflowId: WORKFLOW_CONFIG[1].id }]) {
    const response = await handler(async url => new URL(url).pathname === '/workflows/' ? json(inventory())
      : json(page([log(WORKFLOW_CONFIG[0], 'mis-scoped', 'execution', 'success', 50, alteration)])))(request());
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.issue.code, 'UNEXPECTED_SOURCE_RESPONSE');
    assert.ok(body.workflows.every(workflow => workflow.activity === null));
  }
});

test('a timeout aborts the upstream request and returns a safe unavailable result', async () => {
  let aborted = false;
  const response = await handler((_url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => { aborted = true; reject(new Error(ENV.GHL_PRIVATE_INTEGRATION_TOKEN)); }, { once: true });
  }), { requestTimeoutMs: 15, snapshotTimeoutMs: 30 })(request());
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.issue.code, 'HIGHLEVEL_TIMEOUT');
  assert.equal(aborted, true);
  assert.equal(body.connected, false);
  assert.ok(!JSON.stringify(body).includes(ENV.GHL_PRIVATE_INTEGRATION_TOKEN));
});

test('an exhausted whole-snapshot budget prevents another upstream call', async () => {
  let elapsed = 0, calls = 0;
  const response = await handler(async () => {
    calls += 1;
    elapsed = 21;
    return json(inventory());
  }, { clock: () => elapsed, snapshotTimeoutMs: 20 })(request());
  const body = await response.json();
  assert.equal(calls, 1);
  assert.equal(response.status, 503);
  assert.equal(body.connected, true);
  assert.equal(body.issue.code, 'HIGHLEVEL_TIMEOUT');
  assert.ok(body.workflows.every(workflow => workflow.activity === null));
});

test('new statuses stay other and identityless log records never fabricate executions', async () => {
  const response = await handler(async url => {
    if (new URL(url).pathname === '/workflows/') return json(inventory());
    const workflow = WORKFLOW_CONFIG.find(item => url.includes(item.id));
    return json(page([log(workflow, 'new-status', '', 'future_status', 50)]));
  })(request());
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.ok(body.workflows.every(workflow => workflow.activity.runs === 0 && workflow.activity.events[0].status === 'other'));
});

test('missing workflow configuration and denied inventory reads are not shown as connected activity', async () => {
  const missing = inventory(); missing.workflows = missing.workflows.filter(item => item.id !== WORKFLOW_CONFIG[1].id);
  const response = await handler(async () => json(missing))(request());
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.issue.code, 'CONFIGURED_WORKFLOW_MISSING');
  assert.equal(body.workflows[1].status, 'not_found');
  const denied = await handler(async () => json({ message: ENV.GHL_PRIVATE_INTEGRATION_TOKEN }, 401))(request());
  const deniedBody = await denied.json();
  assert.equal(denied.status, 503);
  assert.equal(deniedBody.connected, false);
  assert.equal(deniedBody.issue.code, 'HIGHLEVEL_ACCESS_DENIED');
  assert.ok(!JSON.stringify(deniedBody).includes(ENV.GHL_PRIVATE_INTEGRATION_TOKEN));
});
