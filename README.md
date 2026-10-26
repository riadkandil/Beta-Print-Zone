# Print-Zone
Transactions Recorder Web App

## Versions
- `/` — **Print Zone v3.2**, the main app.
- `/classic/` — the classic app (v1.12), kept as a fallback on the **same database**: everything recorded in one appears in the other, and the sign-in carries over between them.
- `/beta/` — redirects to `/` so old links keep working.
- `/demo/` — **v3.2 demo** with sample data only: it never connects to the shop's database and keeps its browser storage apart from the real app. It signs in as admin automatically; add `?role=employee` to see the employee view.

See [APP-SUMMARY.md](APP-SUMMARY.md) for the design, features, data model and change log.

## Tests
`tests/money.html` checks the money rules (sales, collected, outstanding, part-payments, edits, client names, data loading). It refuses to run unless the page is served from localhost by a copy that does not load Firebase, so it never touches live data. Open it in a browser on such a copy; it prints PASS/FAIL per check.

## Security
Roles (employee / admin) are checked in the browser only. The change log guards against honest mistakes, not deliberate tampering.
