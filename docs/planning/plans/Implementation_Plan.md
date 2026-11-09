# Implementation Plan: інтегрований стан

Оновлено 2026-11-09. Integration branch `develop` перевірено на `537ffcc9`. Усі PR #75–#103 і #105 merged; #104 закритий без merge, бо його зміни збережені в #105. `main` у цьому проході не змінювався.

## Поточний результат

| Область | Стан |
| --- | --- |
| TASK-013–TASK-036, TASK-038–TASK-039 | Реалізація merged у `develop`; unit/HTTP/security/MongoDB suites green на останньому локальному проході. |
| TASK-037 / Issue #59 | Повна developer panel реалізація підготовлена в PR #106; потрібні GitHub CI та незалежний review. |
| TASK-040 / Issue #62 | Технічна інтеграційна перевірка й матеріали захисту підготовлені окремим PR; team demonstration ще не відбулася. |
| Старі Issues #6, #12, #13, #15, #16, #28 | Потребують окремого acceptance audit; TASK-001 не закривається без team-lead confirmation контрактів. |

## Перевірене локально

- clean `npm ci`: 0 vulnerabilities;
- MongoDB 8 replica set `rs0`, startup, readiness, API, OpenAPI і Swagger: passed;
- повний demo seed двічі в allowlisted `kindergarten_seed_test`: repeatable, без очищення або overwrite;
- flow group → child → enrollment → invoices → payments → schedule → withdrawal → refund → reports виконаний через production services і перевірений real HTTP/MongoDB tests;
- forecast, breakeven, configuration search та generator повернули assumptions/budgets;
- scope, exact minor-unit money, transaction rollback/concurrency й aggregation перевірені 26 MongoDB cases;
- Swagger UI реально відкрито у Microsoft Edge; командна демонстрація не заявляється.

## Gate до завершення TASK-040

1. PR #106 має отримати незалежний review, green CI і штатний merge у `develop`.
2. TASK-040 PR має отримати незалежний review і green CI.
3. Команда проводить записаний walkthrough за `task-040-demo-and-defense.md`; кожен учасник пояснює власний DI/schema/service/repository/DTO/tests.
4. Reviewer підтверджує відсутність open money/scope/atomicity blockers.
5. Лише після цього Issue #62 переводиться в Done; підготовлені матеріали самі по собі не є проведеною демонстрацією.
