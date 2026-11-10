# TASK-040: інтеграційний checklist

Оновлено 2026-11-09 на Windows checkout `537ffcc9`. Тут записані лише фактично виконані кроки. Командна демонстрація ще не проводилася.

## Результати цього проходу

| Перевірка | Фактичний результат |
| --- | --- |
| `npm ci` | Passed; 123 packages, 0 vulnerabilities. |
| Clean server startup | Passed against MongoDB 8 `rs0` and `kindergarten_seed_test`; process connected without hidden manual steps. |
| Liveness/readiness/API | `/health/live`, `/health/ready`, `/api/v1` — HTTP 200. |
| OpenAPI/Swagger | OpenAPI 3.1 and `/api-docs/` — HTTP 200; Swagger реально відкрито в локальному Edge. |
| Demo seed first run | 8 base groups and 46 base catalog records inserted; full scenario produced 2 parents, 11 employees, 3 active scenario groups, 22 children, 5 invoices, 3 payments, 1 refund, expenses and schedules. |
| Demo seed second run | 0 base groups and 0 base catalog records inserted; scenario IDs/counts/statuses and finance totals remained stable. |
| `npm run check` | Passed: format, syntax (230 JS files), 174 unit/HTTP/security tests passed, 27 MongoDB-only cases skipped by design. |
| `npm run test:mongodb` | 26 passed, 0 failed, 0 skipped on local Docker replica set. |
| GitHub CI | Must pass on the TASK-040 PR before acceptance. |

Seed report for `2026-11`: accrued income `4,680,000` minor units, net receipts `1,500,000`, approved expenses `250,000`, cash flow `1,250,000`. These values came from the real MongoDB report, not from demo UI constants.

## Business flow evidence

The repeatable TASK-039 seed executes the business services in this order and keeps normal authorization, validation, audit and MongoDB transactions:

1. catalog/resources and people;
2. group activation and capacity/resource guards;
3. child application and enrollment;
4. monthly and annual invoices;
5. pending and confirmed payments;
6. draft generation and schedule publication;
7. child withdrawal with future obligation cancellation;
8. capped, idempotent refund;
9. expense totals and monthly finance report.

`tests/integration/demo-seed.mongodb.test.js` then starts the real HTTP router and verifies parent own/foreign scope, invoice/refund reads, finance/expense aggregations, draft/published schedules, forecast, breakeven, configuration search and schedule generator. The broader replica-set suite separately checks concurrent enrollment, resource guards, invoice generation, payment confirmation, refund caps, transaction rollback and aggregation.

## Browser and portability evidence

| Item | Status |
| --- | --- |
| Swagger in local Microsoft Edge | Passed; screenshot in [`../evidence/task-040-swagger-browser.png`](../evidence/task-040-swagger-browser.png). |
| TASK-037 developer panel | Implemented and browser-tested in PR #106; not yet part of `develop`, so it is a dependency, not accepted TASK-040 evidence. |
| One continuous authenticated browser mutation walkthrough | Not recorded. The real seed and HTTP integration cover the flow technically, but this does not replace the required team walkthrough. |
| Current exact SHA on macOS | Not rerun in this pass. PR #103 previously proved a clean macOS workflow; current PR CI remains required. |
| Team defense / each participant’s explanation | Not conducted. |

TASK-040 must remain open until PR #106 is independently reviewed and merged, the TASK-040 PR is independently reviewed with green CI, and the team actually completes the recorded demonstration.
