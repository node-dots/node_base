# TASK-040: інтеграційний checklist

Оновлено 19 листопада 2026 року для baseline `develop` `60c80b4` і синхронізованого feature head PR #112.
Тут записані технічно підтверджені факти. Командна демонстрація ще не проводилася.

## Поточні докази

| Перевірка | Фактичний результат |
| --- | --- |
| Dependency install/audit | `npm ci` PASS; 0 vulnerabilities |
| Unit/HTTP/security | 218 tests: 189 pass, 29 Mongo-skipped, 0 fail |
| MongoDB replica-set integration | 28/28 PASS |
| Browser panel | PASS: 40 read-only requests і real ADMIN/API mode |
| Postman/Newman | 120 requests, 688 assertions, 0 failures |
| GitHub CI PR #113 | 4/4 SUCCESS |
| GitHub CI merged `develop` | 4/4 SUCCESS, run `44541067173` |
| Swagger/OpenAPI | OpenAPI 3.1, 68 operations, `/api-docs/` і JSON endpoint |
| Entity history | 9/9 persistent models, transactional snapshots, ADMIN API, 12 requests folder 21 |

Seed report для `2026-11`: accrued income `4 680 000` minor units, net receipts
`1 500 000`, approved expenses `250 000`, cash flow `1 250 000`. Це значення реального
MongoDB report у repeatable demo scenario, не constants UI.

## Перевірений flow

1. catalog/resources і people;
2. group activation та capacity/resource guards;
3. child application/enrollment/scope;
4. monthly/annual invoices;
5. PENDING/CONFIRMED payments;
6. draft generation і schedule publication;
7. withdrawal, cancellation і capped refund;
8. expenses, finance/operations reports і planning scenarios;
9. append-only entity history, redaction, compare, rollback/retry/concurrency;
10. developer panel Demo/API isolation.

## Залишковий acceptance

- TASK-001: team-lead/team contract approval за підготовленим session protocol.
- TASK-010: незалежний S7 arithmetic review.
- TASK-040: реальний walkthrough усією командою і defect/sign-off comment.

Повний сценарій: [`../testing/TASK-040_DEMO_RUNBOOK.md`](../testing/TASK-040_DEMO_RUNBOOK.md).
До його реального sign-off TASK-040 залишається `In Review`.
