# Parallax Agent Quarter

An original Paris-inspired sales page and interactive starter-team demonstration, served at `/city-demo/`. The existing homepage links here.

The $999 setup package covers lead response, booking, and follow-up, with usage billed separately. The demo runs synthetic records locally; it does not connect accounts, send messages, create appointments, or bill usage. Existing consultation links lead to AutoCraft Studios booking.

## Event-driven display

- Three agent addresses with limestone facades, mansard roofs, balconies, cafe awnings, and windows that animate only during work. Completed runs leave steady warm windows.
- Four external connections show accepted sample inputs, business rules, calendar evidence, and distinct prepared / provider-accepted / delivered message states. Hover connection panels for full fields; phone layouts have expandable connection cards.
- Failures retain a finding and smoke during recovery until the outcome is verified. A service-area exception pauses for explicit approval or decline.
- The successful scenario starts when visible and replays the same records. Pause and Keep city working control playback. Counts reset each cycle; nothing accumulates as fabricated business activity. Reduced-motion users start playback manually.
- Brand previews last only in the current browser session.

## Development and verification

No framework or build step. Serve this directory over HTTP alongside the existing static site. `index.html?embed=1` shows only the workspace.

Run `npm test` here (or `node --test city-demo/*.test.mjs` from the repository root). The tests cover event and usage deduplication, successful outcomes, failure recovery, review decisions, immutable snapshots, connection input values, and evidence-state distinctions.

Browser checks at desktop and 390px phone widths cover the city, playback, recovery, review, and connection readouts. This feature branch is a reviewable UI revision; production integrations, tenant accounts, usage rates, billing, and custom-domain verification are separate work.
