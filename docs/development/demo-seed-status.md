# Demo seed status

Updated 2026-11-05.

## Verified seed behavior

`npm run seed` is allowlisted to `kindergarten_dev` and `kindergarten_seed_test`. The test database was seeded twice using the Docker MongoDB replica set. The first run inserted 8 demo groups and 46 catalog records. The second inserted no duplicates. A manual edit to a seeded group remained after the rerun. The test used synthetic data only.

The seed remains idempotent and insert-only: it creates the initial catalog and demo groups and does not overwrite existing fields.

## TASK-039 still incomplete

The seed does not create people with parent accounts, children and enrollments, invoices, payments/refunds, expenses, or a published schedule. The full end-to-end dataset is not complete.

Do not add raw database inserts for dependent business records. A safe full seed needs supported domain provisioning for synthetic people/accounts and then must run the same group, child, enrollment, invoice, payment, expense, and schedule commands as the application. It also needs an allowlisted test database, repeatability checks, and proof that manual changes survive reruns.

Bootstrap ADMIN is configured separately through local environment variables. Never commit its password or other credentials.
