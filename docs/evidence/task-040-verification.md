# TASK-040 verification evidence

Date: 2026-11-09. Platform: Windows, local Microsoft Edge, Docker MongoDB 8 replica set.

- `npm ci`: passed, 0 vulnerabilities.
- Clean API process: connected to `kindergarten_seed_test`; live/ready/API/OpenAPI/Swagger returned 200.
- Demo seed: first and second runs completed; second run inserted 0 base groups/catalog records and retained 22 children, 5 invoices, confirmed/pending payments, refund, expenses and schedules.
- Real monthly report: accrued `4,680,000`, receipts net `1,500,000`, expenses `250,000`, cash flow `1,250,000` minor units.
- MongoDB integration: 26/26 passed in the immediately preceding integration run.
- Browser: Swagger UI opened in Edge; screenshot [`task-040-swagger-browser.png`](./task-040-swagger-browser.png).

This is technical verification. No team demonstration or defense was conducted during this pass.
