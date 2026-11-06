/** Read-only connection projections of accepted synthetic workflow events. */

const last = (events, predicate) => events.findLast(predicate);
const short = (value, limit) => {
  const text = String(value ?? '');
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
};
const uniqueCount = (events, payload) => new Set(events.filter(event => event[payload]).map(event => event[payload].id)).size;

function record(id, label, value, detail, extra = {}) {
  const result = {
    id, label, value, detail, status: 'ready', active: false, count: 0,
    countLabel: 'records', lastUpdate: null, fields: {}, ...extra,
  };
  result.value = short(result.value, 20);
  result.detail = short(result.detail, 55);
  return result;
}

function inboxSnapshot(state, events) {
  const received = last(events, event => event.sampleInput);
  if (!received) return record('inbox', 'Website inbox', 'No inquiry yet', 'Run a scenario to receive a sample inquiry.', { countLabel: 'sample inquiries' });
  const input = received.sampleInput;
  return record('inbox', 'Website inbox', `${input.name} · ${input.service}`, `${input.channel} · prefers ${input.contactPreference.toLowerCase()}`, {
    status: 'updated', active: state.agents?.response?.status === 'running',
    count: uniqueCount(events, 'sampleInput'), countLabel: 'sample inquiries', lastUpdate: received.timestamp,
    fields: {
      Name: input.name, Service: input.service, Channel: input.channel,
      'Contact preference': input.contactPreference, 'Service area': input.serviceArea, Request: input.request,
    },
  });
}

function knowledgeSnapshot(state, events) {
  const checkEvent = last(events, event => event.sampleContext);
  const started = last(events, event => event.agentId === 'response' && event.type === 'run.started');
  if (!started && !checkEvent) return record('knowledge', 'Business knowledge', 'No check yet', 'Awaiting an inquiry to match against business rules.', { countLabel: 'policy checks' });
  if (!checkEvent) return record('knowledge', 'Business knowledge', 'Matching context', 'Checking service, area, and contact preference.', {
    status: 'running', active: state.agents?.response?.status === 'running', lastUpdate: started.timestamp, countLabel: 'policy checks',
  });
  const context = checkEvent.sampleContext;
  const result = {
    matched: ['Rules matched', 'Service and area match the sample business rules.'],
    exception: ['Review needed', 'Service-area exception · waiting for a person.'],
    approved: ['Exception approved', 'A reviewer approved this sample service-area exception.'],
    declined: ['Exception declined', 'A reviewer closed this request without booking.'],
  }[context.result] || ['Check recorded', 'A sample policy check is recorded in the activity log.'];
  return record('knowledge', 'Business knowledge', ...result, {
    status: state.pendingApproval ? 'review' : 'updated',
    active: state.agents?.response?.status === 'running',
    count: uniqueCount(events, 'sampleContext'), countLabel: 'policy checks', lastUpdate: checkEvent.timestamp,
    fields: {
      Service: context.service, 'Service rule': context.serviceRule, 'Service area': context.serviceArea,
      'Contact preference': context.contactPreference, Decision: result[0],
    },
  });
}

function calendarSnapshot(state, events) {
  const relevant = last(events, event => event.agentId === 'booking' && ['run.started', 'run.failed', 'booking.confirmed', 'finding.resolved'].includes(event.type));
  const query = last(events, event => event.sampleCalendar)?.sampleCalendar;
  const confirmation = last(events, event => event.type === 'booking.confirmed');
  const bookings = Object.values(state.outcomes?.bookings || {}).filter(booking => booking.status === 'confirmed');
  if (!relevant) return record('calendar', 'Calendar', 'No request yet', 'Awaiting a qualified sample inquiry.', { countLabel: 'confirmed bookings' });
  const fields = query ? { Calendar: query.name, Service: query.service, Length: `${query.durationMinutes} minutes` } : {};
  const common = { count: bookings.length, countLabel: 'confirmed bookings', lastUpdate: relevant.timestamp, fields };
  if (state.agents?.booking?.status === 'running') return record('calendar', 'Calendar', 'Checking slots', 'Sample availability lookup is in progress.', {
    ...common, status: 'running', active: true,
  });
  if (state.agents?.booking?.status === 'failed') return record('calendar', 'Calendar', 'Connection failed', `${relevant.errorCode || 'Connector error'} · no sample booking created.`, {
    ...common, status: 'failed', fields: { ...fields, Error: relevant.errorCode || 'Connector error' },
  });
  if (confirmation && bookings.length) {
    const appointment = confirmation.sampleAppointment;
    return record('calendar', 'Calendar', 'Booking confirmed', appointment ? `${appointment.reference} · ${appointment.time.toLowerCase()}` : 'Sample calendar confirmation is recorded.', {
      ...common, status: 'updated', fields: { ...fields,
        Reference: appointment?.reference || confirmation.bookingId,
        ...(appointment ? { 'Sample time': appointment.time } : {}),
        Evidence: 'Simulated calendar confirmation',
      },
    });
  }
  return record('calendar', 'Calendar', 'Waiting for evidence', 'No calendar confirmation has been recorded.', common);
}

function messagesSnapshot(state, events) {
  const relevant = last(events, event => event.agentId === 'followup' && ['run.started', 'message.prepared', 'message.accepted', 'message.delivered'].includes(event.type));
  const messages = Object.values(state.outcomes?.messages || {});
  const deliveredCount = messages.filter(message => message.status === 'delivered').length;
  if (!relevant) return record('messages', 'Messaging', 'No message yet', 'Awaiting a confirmed sample appointment.', { countLabel: 'message records', deliveredCount: 0 });
  const payload = last(events, event => event.sampleMessage)?.sampleMessage;
  const outcome = messages.find(message => message.id === relevant.messageId) || messages.at(-1);
  const status = outcome?.status || 'preparing';
  const display = {
    preparing: ['Preparing message', 'Building a confirmation from the sample booking.'],
    prepared: ['Draft prepared', 'Confirmation ready · not sent or delivered.'],
    provider_accepted: ['Provider accepted', 'Simulated acceptance · awaiting delivery evidence.'],
    delivered: ['Delivery confirmed', 'Simulated receipt · not a message read receipt.'],
  }[status];
  return record('messages', 'Messaging', ...display, {
    status: status === 'delivered' ? 'updated' : 'running',
    active: state.agents?.followup?.status === 'running', count: messages.length,
    countLabel: 'message records', deliveredCount, lastUpdate: outcome?.updatedAt || relevant.timestamp,
    fields: payload ? {
      Recipient: payload.recipient, Channel: payload.channel, Reference: payload.reference,
      Message: payload.text, 'Evidence state': display[0],
    } : {},
  });
}

export function getConnectionSnapshot(state) {
  const events = state.events;
  return [
    inboxSnapshot(state, events), knowledgeSnapshot(state, events),
    calendarSnapshot(state, events), messagesSnapshot(state, events),
  ];
}
