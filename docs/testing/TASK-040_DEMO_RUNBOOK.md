# TASK-040: повний runbook командної демонстрації

Статус: **технічно підготовлено, демонстрацію не проведено**. Виконання команд однією
особою або CI не замінює присутність і пояснення команди. Sign-off фіксується у
[Issue #62](https://github.com/node-dots/node_base/issues/62).

## 1. Чистий запуск

Працювати з погодженим exact SHA `develop` у чистому checkout. Не показувати `.env`, JWT,
паролі або raw Authorization headers у записі.

```bash
git clone https://github.com/node-dots/node_base.git
cd node_base
git switch develop
git pull --ff-only origin develop
git rev-parse HEAD
npm ci
npm audit --audit-level=low
npm run infra:up
docker compose exec -T mongodb mongosh --quiet /scripts/mongodb-init.js
```

Створити локальний `.env` за `.env.example`, згенерувати новий `JWT_SECRET` щонайменше
32 bytes і окремі demo ADMIN credentials. Далі:

```bash
npm run bootstrap:admin
npm run seed
npm run seed
npm start
```

Другий seed має зберегти сталі counts/IDs і ручні дані. В іншому terminal:

```bash
curl --fail http://127.0.0.1:3000/health/live
curl --fail http://127.0.0.1:3000/health/ready
curl --fail http://127.0.0.1:3000/api/v1/openapi.json
```

Відкрити `http://127.0.0.1:3000/api-docs/` і показати OpenAPI 3.1, Bearer Auth та
history endpoints. MongoDB має бути PRIMARY:

```bash
docker compose exec -T mongodb mongosh --quiet --eval "rs.status().myState"
```

Очікуване значення — `1`.

## 2. Автоматизовані докази перед live flow

```bash
npm run test:all
```

Контрольний результат актуального технічного baseline: unit/HTTP без failures, MongoDB
integration 27/27, browser panel PASS, Newman 112 requests / 638 assertions / 0 failures.
Показати також 4/4 green jobs exact SHA у GitHub Actions. Якщо числа змінилися через
reviewed розширення collection/tests, записати нові фактичні значення, а не копіювати baseline.

## 3. Наскрізна Node.js + MongoDB + Swagger демонстрація

1. Login ADMIN і `/auth/me`: actor читається з БД, secrets/`passwordHash` відсутні.
2. Swagger створює DRAFT group; invalid capacity дає safe 400/422 без write.
3. Призначити catalog resources/staff і активувати group; показати capacity/occupancy guard.
4. Створити child з guardian, enroll, suspend/resume; чужий PARENT отримує 404.
5. Створити monthly/annual invoice; суми — integer minor units.
6. PARENT створює PENDING payment; ADMIN підтверджує; balance змінюється один раз.
7. Опублікувати schedule; stale revision і resource conflict відхиляються.
8. Withdraw child, скасувати майбутні parts, виконати capped/idempotent refund.
9. Створити/approve/pay expense; порівняти accrual, receipts, expenses, result і cash flow.
10. Показати forecast/breakeven/configuration search та їхні assumptions/budgets.
11. Відкрити developer panel спочатку у Demo, потім API mode; JWT лише в пам’яті.

## 4. History API

Після створення group двічі змінити capacity. Через Swagger або Postman показати:

```http
GET /api/v1/history?entityType=GROUP&entityId={groupId}&page=1&pageSize=50
GET /api/v1/history/GROUP/{groupId}/versions/1
GET /api/v1/history/GROUP/{groupId}/compare?fromVersion=1&toVersion=3
```

Перевірити contiguous versions, full before/after snapshots, changed fields і відсутність
secrets. PARENT-запит до history має повернути `403`; mutation endpoint для history відсутній.
Пояснити, що business write, counter і version використовують ту саму MongoDB session, а
прямі сторонні writes поза Mongoose потребують окремої policy/Change Stream detector.

## 5. Postman

```bash
npm run test:postman
```

Показати folders `Complete End-to-End Scenario` та `Entity Version History`, sanitized
`postman/results/postman-summary.json` і JUnit. Newman працює з випадковою test database,
не з production/dev даними.

## 6. Ролі учасників

| Роль | Живий блок | Контрольне питання |
| --- | --- | --- |
| S1 — integration | clean checkout, config, DI, CI, rs0 | Який крок доводить відсутність hidden setup? |
| S2 — auth/people | login, actor refresh, roles, DTO redaction | Як відкликається старий JWT? |
| S3 — groups/children | resources, capacity, enrollment/scope | Як concurrency не переповнює group? |
| S4 — invoices/payments | exact money, idempotency, refund | Чому PENDING не змінює receipt/balance? |
| S5 — expenses/reports | serviceMonth vs paidAt, aggregations | Чим result відрізняється від cash flow? |
| S6 — schedules/history | revision/publish і version history | Де проходить transaction/session boundary? |
| S7 — finance review | TASK-010 worksheet, forecast/breakeven | Які assumptions не можна назвати profit? |
| S8 — Postman/panel/security | E2E, Demo/API isolation, negative states | Чому 401/403/404/429 мають різний сенс? |

Реальні GitHub handles слід вписати до початку сесії. Перерозподіл дозволений, але кожна
область і кожне контрольне питання мають власника.

## 7. Завершення і sign-off

```bash
npm run infra:down
```

У Issue #62 reviewer залишає exact SHA, дату/час, присутніх, посилання на green CI,
фактичні test/Postman counts, знайдені defects та рішення `accepted` або `changes requested`.
До реального sign-off TASK-040 залишається `In Review`, а реліз у `main` не оголошується.
