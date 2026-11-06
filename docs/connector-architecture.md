# Proposed connector architecture

Status: design checkpoint, not an implemented plug-and-play integration. The current private viewer is a single-owner HighLevel pilot configured for one location and three workflows. The demo accepts synthetic events only. HighLevel workflow execution logs were unavailable for the pilot location when last checked.

## Goal

Let the same city display observed activity from different automation and agent systems through provider-specific adapters. A provider connection must not need to change the visual renderer, and each business must see only its own data.

## Boundaries

1. **Provider adapter:** reads or receives evidence from one configured provider and maps it into the common model. Keep provider credentials and API calls on the server. Support a demo adapter for synthetic fixtures, then evolve the existing HighLevel reader behind this boundary; design a separate n8n adapter after its transport is selected.
2. **Common activity model:** versioned records identifying the workspace, provider connection, agent or workflow, execution, event, observed time, status, and evidence. Include stable source IDs and explicit unavailable, unknown, and stale states. Only expose approved fields; omit contact details, message content, credentials, and raw provider errors by default.
3. **Projection:** build a city snapshot from normalized records. Deduplicate within workspace, provider connection, and event ID; handle out-of-order events and source failures. A workflow step succeeding alone does not prove a booking, delivery, or finished run. Preserve provider evidence and report an outcome only when the provider supplies the relevant confirmation.
4. **City presentation:** consume the common snapshot and workspace-specific agent mappings instead of fixed provider names or three hardcoded roles. Render animation from observed activity; label demo records as samples and distinguish decorative motion.
5. **Workspace security:** before offering this to multiple customers, add authenticated users, server-owned per-workspace connections and credentials, authorization on every read, and isolation tests. The present single-owner session is not a tenant system.

## Provider considerations

- **HighLevel:** retain the existing read-only behavior and location restrictions until a workspace-aware replacement is reviewed and tested. The pilot's execution-log eligibility problem cannot be solved by this refactor alone.
- **n8n:** choose and document a supported method for each deployment, such as scoped read access or an authenticated event endpoint. Instance URL, provider identity, credentials, supported versions, and actual event semantics must be verified. Do not assume every n8n installation exposes identical capabilities.
- **Other agents:** implement the same adapter contract with provider-specific evidence mappings. A generic event endpoint, if added, needs authentication, payload limits, replay protection, and a defined acknowledgement/retry policy.

For outbound provider connections, validate allowed destinations and protect against requests to internal services. Treat source payloads as untrusted. No workflow edits, messages, bookings, charges, or paid services are implied by this design.

## Suggested first implementation

Implement and test the versioned common model and a synthetic adapter, then migrate the existing HighLevel reader without changing its observed behavior. Keep tenant provisioning and an actual n8n connection as separate, reviewable milestones. Do not advertise live multi-provider or multi-tenant support until each is built and verified end to end.

Acceptance should cover duplicate and out-of-order events, absent or unknown data, stale and failed reads, source/workspace isolation, safe field projection, existing demo and HighLevel behavior, and mobile/keyboard access. Real provider acceptance requires an authorized test instance and known source events.
