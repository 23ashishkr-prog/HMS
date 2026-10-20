# Performance: before/after (PR #22)
Measured from the QA box against production (QATEST tenant). Each figure is the median of 7 API calls or 5 page loads. Script: `/workspace/qa/perf.mjs`.

| Request | Before (ms) | After (ms) |
|---|---|---|
| GET /api/frontdesk (reception) | 131 | 127 |
| GET /api/queue (reception) | 127 | 122 |
| GET /api/patients?q= | 127 | 124 |
| GET /api/assistant?q= | 133 | 119 |
| Page /frontdesk (network idle*) | 1010 | 936 |
| Page /opd (network idle*) | 983 | 923 (API calls per load: 5 → 4) |

\*Playwright "networkidle" includes its own 500 ms quiet window.

**Finding:** the new `Server-Timing` header shows the server-side app time is only about 5–7 ms per API call. The rest of the ~120 ms is network round-trip plus Vercel function routing (the box is about 75 ms from iad1, even for a static file). Server-side tuning therefore buys little.

**What changed:**
- The session check and the subscription lookup now run in parallel, and the module gate reuses the same lookup instead of running it again.
- The front-desk reads run in parallel.
- `/api/auth/me` is shared on the client, so it is fetched once per page instead of twice.
- Added hot-path indexes, and trigram search indexes when `pg_trgm` is available.

**Next levers (not done):**
- Fold the subscription status into `/api/auth/me` (one fewer request per page).
- Serve users from an India region (for example a Vercel function region near the database, such as bom1 or sin1).
