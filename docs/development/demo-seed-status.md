# TASK-039 demo seed

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

The seed creates monthly tuition and meal invoices plus one annual tuition invoice; one monthly receipt remains pending, another is confirmed, and the annual receipt is refunded after withdrawal. It also creates a paid rent expense, a cancelled draft expense, and a published weekly schedule with thirty program slots. The seed prints the actual finance report totals from MongoDB rather than hard-coding them in this document.

After the first run, the second run must retain the same demo child and invoice counts, payment/refund statuses, canceled expense state, schedule, and group occupancy. In particular, rerunning the seed must not restore the cancelled expense or add another receipt or refund.

## Swagger demo

Start the API with `npm run dev`, then open `/api-docs/`.

1. Sign in with the local ADMIN account and inspect `GET /api/v1/groups` and `GET /api/v1/groups/summary`. Confirm the full, empty, and partially occupied groups.
2. Sign in as `demo.parent1@example.test`. Use the printed child IDs with `GET /api/v1/children/{id}` and `GET /api/v1/invoices/children/{childId}`; confirm this parent gets `404` for the other parent's child.
3. Sign in as `demo.parent2@example.test`. Inspect the annual child's invoice. With the printed annual payment ID, `GET /api/v1/payments/{paymentId}/refunds` returns its confirmed refund.
4. As ADMIN, inspect `GET /api/v1/reports/finance/monthly?month={month}`, `GET /api/v1/expenses/totals?month={month}`, and `GET /api/v1/schedules/{weekStart}/published` for the published snapshot. The seed prints the relevant IDs and week.

Both demo-parent passwords are supplied only through `DEMO_PARENT_PASSWORD`. The seed stores a password hash and this repository contains no usable demo credential.
