---
name: frontend-architecture
description: Frontend React 19 + Vite architecture overview — state management, polling patterns, bundle composition, and key scaling concerns for tax filing season
metadata:
  type: project
---

TAX ME frontend is React 19 + Vite + Tailwind CSS v4 + shadcn/ui (custom, not registry-pulled). Single-page app with tab-based routing in App.jsx (no React Router).

**State management:** Profile + taxData held in App.jsx root state. No context, no Zustand. Profile is fetched sequentially (waterfall) on cold load: GET /memory/profile → POST /tax/calculate. App blocks render behind a loading gate until both resolve.

**Polling:**
- Dashboard.jsx TaxUpdatesCard: setInterval every 30s on /api/v1/corpus/status. Cleanup exists (clearInterval in useEffect return). But the inner `load` function is recreated on every render — no useCallback — causing stale closure risk if state updates mid-interval.
- AdminPanel.jsx: setInterval every 10s on /api/v1/corpus/status. Same cleanup pattern. Two components polling the same endpoint simultaneously if both are mounted (they are not — tab-based routing prevents co-mounting).

**Missing abort controllers:** Every fetch call in the codebase (App, Dashboard, TaxFiling, Chatbot, Reports, AdminPanel) fires bare fetch() with no AbortController. On slow networks or slow servers (July 31 peak), a user switching tabs mid-request leaves orphaned in-flight requests that will call setState on unmounted components — React 19 suppresses the error but wastes bandwidth and backend connections.

**Sequential waterfall on startup (App.jsx:33-46):** GET /memory/profile then POST /tax/calculate are awaited sequentially. At 200ms + 400ms each on a loaded server, cold load is 600ms minimum. Under July 31 load (10K req/min to /tax/calculate), P99 latency could push this to 3-5s, blocking the entire UI behind the loading gate.

**Chatbot message history sent on every request (Chatbot.jsx:186):** Full message history array is serialized and sent to /api/v1/chat on every message. No truncation at the client side. A user with 50 messages sends ~50 × average-message-size tokens of context on message 51. This compounds the backend token burn at scale.

**TaxFiling parallel fetch (TaxFiling.jsx:222-225):** /tax/calculate and /itr/generate fire in parallel via Promise.all — this is correct. But a third sequential fetch (POST /memory/update) fires immediately after on line 231 — not parallel, adds ~200ms to the UX.

**Reports.jsx useCallback on load:** load is wrapped in useCallback([]) — stable reference. deleteFiling calls load() after DELETE — triggers a full re-fetch of both filings and summary. Correct but no optimistic update.

**Recharts bundle:** recharts ^3.x is included. Only BarChart + 3 Bar components used in Reports.jsx. Recharts ships ~180KB gzipped when full bundle is included. Vite tree-shakes named exports from recharts so only used components should be included — but recharts has internal barrel re-exports that can defeat tree-shaking depending on version.

**shadcn/ui components:** All 7 are thin wrappers around HTML elements with cn() + CVA. No Radix UI primitives (no @radix-ui/* in package.json). No virtualization, no portals, no complex state. cn() calls twMerge + clsx on every render — negligible cost for simple components, but Button is rendered ~20+ times on Dashboard and TaxFiling simultaneously.

**No code splitting / lazy loading:** All 6 page components (Dashboard, TaxFiling, Chatbot, Reports, Settings, AdminPanel) are imported statically in App.jsx. The entire app bundle loads on first paint. Chatbot imports nothing heavy. TaxFiling is large (649 lines). AdminPanel and Settings are modest. No React.lazy() anywhere.

**No error boundaries:** No ErrorBoundary wrapping any component. A runtime crash in Dashboard (e.g., taxData.summary is null) will white-screen the entire app.

**Why this matters:** On July 31 with 500K users, the sequential startup waterfall + no abort controllers + full chat history on every message = wasted backend capacity and degraded UX under load. The 10s AdminPanel poll is the most aggressive and least justified interval.

**How to apply:** When reviewing new frontend code, flag: (1) missing AbortController on any fetch in useEffect, (2) sequential awaits that could be parallel, (3) missing React.lazy() on new page components, (4) chat history sent without truncation.
