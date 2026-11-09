# TASK-039 demo seed

## Latest verification (2026-11-09)

The documented startup was run twice against the allowlisted `kindergarten_seed_test` MongoDB 8 replica set without dropping the database or volume. The second run inserted zero base groups/catalog entries and retained 2 scoped parents, 11 employees, 3 active scenario groups, 22 children, 5 invoices, confirmed/pending payments, one confirmed refund, three expense states, one published schedule and one draft. The real monthly report returned accrued income `4,680,000`, net receipts `1,500,000`, approved expenses `250,000` and cash flow `1,250,000` minor units for `2026-11`.

Swagger UI was opened in Microsoft Edge; see [TASK-040 evidence](../evidence/task-040-verification.md). This verification did not constitute the required team demonstration.

`npm run seed` creates a synthetic, repeatable demo scenario in the explicitly allowlisted `kindergarten_dev` or `kindergarten_seed_test` database. It first inserts the stable base catalog and groups with `$setOnInsert`, then uses MongoDB-backed application services for people, employee profiles, group activation, child applications and enrollment, invoices, payments, refunds, expenses, and schedule publication. Each business command keeps its normal authorization, transaction, validation, and audit behavior.

The seed never clears a database and does not replace existing people, child profiles, account passwords, or group names. If a stable demo identity or resource has an incompatible manual change, the seed stops with an error instead of moving or overwriting it. The seed accepts only the two database names above for manual runs. Integration tests may use a unique `kindergarten_test_<32 hex>` database name; each test owns and drops only its generated database. The seed does not accept a caller-provided MongoDB URI.

## Setup and run

Set these local environment values in `.env` (keep that file out of Git):

```dotenv
BOOTSTRAP_ADMIN_EMAIL=admin@example.test
BOOTSTRAP_ADMIN_PASSWORD=<private password of at least 12 characters>
BOOTSTRAP_ADMIN_FIRST_NAME=Demo
BOOTSTRAP_ADMIN_LAST_NAME=Administrator
DEMO_PARENT_PASSWORD=<private password of at least 12 characters>
```

Use the normal `MONGO_URI` from the local development setup for the admin bootstrap command. Then run:

```powershell
npm run bootstrap:admin
$env:SEED_DATABASE = "kindergarten_seed_test"
npm run seed
npm run seed
```

Use `kindergarten_dev` instead of `kindergarten_seed_test` when you want the data in the local development database. The `seed` command starts the Compose MongoDB replica set and loads `.env`; the application must have an enabled ADMIN account before it runs.

## Expected scenario

The scenario contains two synthetic parent accounts, eleven employee profiles, three active groups, and twenty-two children. One group is full, one has no children, and one is partially occupied. Parent accounts have separate child scopes. The annual-billing child is withdrawn after an annual payment so the refund workflow can be demonstrated.

The seed creates monthly tuition and meal invoices plus one annual tuition invoice; one monthly receipt remains pending, another is confirmed, and the annual receipt is refunded after withdrawal. Eligible synthetic children are enrolled on the previous day within the active school year so the current month has reportable accrued invoices; the annual-refund child remains on a future billing start. It also creates a paid rent expense, an active draft food expense, a cancelled draft expense, a published weekly schedule with thirty program slots, and an editable one-slot draft for the following week. The seed prints the actual finance report totals from MongoDB rather than hard-coding them in this document.

After the first run, the second run must retain the same demo child and invoice counts, payment/refund statuses, draft and cancelled expense states, published and draft schedules, and group occupancy. In particular, rerunning the seed must not restore the cancelled expense or add another receipt or refund.

The MongoDB integration test starts the real API router against the seeded database, logs in as the synthetic ADMIN and both parents, and checks own/foreign child scope, invoices, refund history, finance and expense reports, draft/published schedules, financial forecast/breakeven/configuration search, and schedule generation over HTTP. It checks that forecast assumptions and the search/generator budget data are returned.

## Swagger demo

Start the API with `npm run dev`, then open `/api-docs/`.

1. Sign in with the local ADMIN account and inspect `GET /api/v1/groups` and `GET /api/v1/groups/summary`. Confirm the full, empty, and partially occupied groups.
2. Sign in as `demo.parent1@example.test`. Use the printed child IDs with `GET /api/v1/children/{id}` and `GET /api/v1/invoices/children/{childId}`; confirm this parent gets `404` for the other parent's child.
3. Sign in as `demo.parent2@example.test`. Inspect the annual child's invoice. With the printed annual payment ID, `GET /api/v1/payments/{paymentId}/refunds` returns its confirmed refund.
4. As ADMIN, inspect `GET /api/v1/reports/finance/monthly?month={month}`, `GET /api/v1/expenses/totals?month={month}`, `GET /api/v1/schedules/{weekStart}/draft` for the following week's editable draft, and `GET /api/v1/schedules/{weekStart}/published` for the current published snapshot. The seed prints the relevant weeks.

Both demo-parent passwords are supplied only through `DEMO_PARENT_PASSWORD`. The seed stores a password hash and this repository contains no usable demo credential.
