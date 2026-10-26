# Print-Zone
Transactions Recorder Web App

## Versions
- `/` — **Print Zone v3.1**, the main app (formerly the beta). v3.2 beta is in progress on the `v3.2-beta` branch (local only).
- `/classic/` — the classic app (v1.12), kept as a fallback on the **same database**: everything recorded in one appears in the other, and the sign-in carries over between them.
- `/beta/` — redirects to `/` so old links keep working.

See [APP-SUMMARY.md](APP-SUMMARY.md) for the design, features, data model and change log.

## Tests
`tests/money.html` checks the money rules (sales, collected, outstanding, part-payments, edits, client names, data loading). It refuses to run unless the page is served from localhost by a copy that does not load Firebase, so it never touches live data. Open it in a browser on such a copy; it prints PASS/FAIL per check.

## Security
Roles (employee / admin) are checked in the browser only. The change log guards against honest mistakes, not deliberate tampering.
