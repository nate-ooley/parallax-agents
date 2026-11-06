import { requireSession } from '../lib/live-auth.mjs';
import { createHighLevelHandler } from '../lib/highlevel.mjs';

// Only the protected observer calls this endpoint. Credentials and source reads
// stay on the server; this API never starts workflows or performs CRM writes.
export default { fetch: createHighLevelHandler({ requireSession }) };
