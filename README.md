# Print-Zone
Transactions Recorder Web App

## Versions
- `/` — **Print Zone v3.0**, the main app (formerly the beta).
- `/classic/` — the classic app (v1.12), kept as a fallback on the **same database**: everything recorded in one appears in the other, and the sign-in carries over between them.
- `/beta/` — redirects to `/` so old links keep working.
- `/demo/` — **v3.2 beta demo** with sample data only: it never connects to the shop's database and keeps its browser storage apart from the real app. It signs in as admin automatically; add `?role=employee` to see the employee view. Source: branch `v3.2-beta`.

See [APP-SUMMARY.md](APP-SUMMARY.md) for the design, features, data model and change log.
