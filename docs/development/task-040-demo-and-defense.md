# TASK-040: сценарій demo та командного захисту

Це підготовлений сценарій. Позначку «проведено» ставить reviewer тільки після реальної командної сесії.

## Перед сесією

1. Новий checkout `develop`; `npm ci`, `.env`, MongoDB `rs0`, bootstrap ADMIN.
2. Двічі `SEED_DATABASE=kindergarten_seed_test npm run seed`; порівняти counts/statuses.
3. `npm run check` і `npm run test:mongodb`; відкрити green GitHub CI.
4. Відкрити Swagger та developer panel з PR #106 після її merge.

## Наскрізний показ

1. **Group/resources:** full, empty і partial groups; capacity/resource guards.
2. **Child/scope:** own child для parent — 200, foreign child — 404; enrollment і occupied seat.
3. **Billing:** monthly + annual invoice, exact minor units, current balances і `asOf`.
4. **Payments:** pending → confirmed; idempotency, no overpayment, actual occurrence time.
5. **Schedule:** draft revision, generator budget, validation і immutable published snapshot.
6. **Withdrawal/refund:** future annual parts cancelled; child/invoice/payment refund caps збігаються.
7. **Reports:** monthly accrual, net receipts, approved expenses, cash flow, current balances; показати MongoDB aggregation source.
8. **Planning:** forecast assumptions, breakeven candidates і configuration-search budget.

## Що пояснює кожен учасник

| Учасник / роль у сесії | Що показує і пояснює |
| --- | --- |
| S1 — integration/startup | DI composition root, config validation, CI, MongoDB `rs0`, як відтворити запуск без hidden steps. |
| S2 — people/auth/access | actor refresh from DB, role permissions, field policy, DTO redaction, audit/token revocation tests. |
| S3 — groups/children | repository guards, group resources, enrollment transaction, scope та concurrency tests. |
| S4 — invoices/payments | cent arithmetic, idempotency, invoice balance transitions, payment/refund transaction boundaries. |
| S5 — expenses/reports | service month vs cash date, corrections, aggregation pipelines, current balance semantics. |
| S6 — scheduling | generator/validator budgets, optimistic revision, publish snapshot і resource guard. |
| S7 — finance scenarios | forecast/breakeven/search assumptions, deterministic limits і safe-integer validation. |
| S8 — demo/UI/security review | seed repeatability, Demo/API isolation, memory-only JWT, 401/429/timeout/offline і defect log. |

Якщо фактичний розподіл команди інший, імена/модулі коригуються до сесії, але всі області й ownership мають бути покриті.

## Sign-off

- [ ] Усі учасники були присутні й показали свій результат.
- [ ] Незалежний reviewer перевірив money/scope/atomicity.
- [ ] Windows і macOS reproduction записані з авторами та SHA.
- [ ] Open defects класифіковані; blockers відсутні.
- [ ] Issue #62 має посилання на merged PR і запис/протокол demo.

До заповнення sign-off TASK-040 не є Completed.
