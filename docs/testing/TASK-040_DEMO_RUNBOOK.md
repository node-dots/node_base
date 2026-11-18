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

Контрольний результат актуального технічного baseline: 213 Node tests (184 pass,
29 Mongo-skipped, 0 fail), MongoDB integration 28/28, browser panel PASS, Newman
120 requests / 687 assertions / 0 failures.
Показати також 4/4 green jobs exact SHA у GitHub Actions. Якщо числа змінилися через
reviewed розширення collection/tests, записати нові фактичні значення, а не копіювати baseline.

## 3. Наскрізна Node.js + MongoDB + Swagger демонстрація

Виконати всі 20 пунктів без пропуску; exact IDs зберігати як локальні environment variables,
не вставляти JWT або паролі у протокол:

1. **Node.js:** показати `npm start`, liveness/readiness і request ID.
2. **MongoDB:** показати `rs.status().myState === 1` і test/dev database name.
3. **Swagger:** відкрити `/api-docs/`, OpenAPI 3.1 та Bearer Auth.
4. **ADMIN login:** виконати login і `/auth/me`; actor читається з БД, secrets відсутні.
5. **Група:** створити DRAFT group; invalid capacity відхиляється без data/version write.
6. **Місткість:** двічі змінити capacity й зафіксувати старе/нове значення.
7. **Версії групи:** list/version/compare показують `CREATE, UPDATE, UPDATE` і `1,2,3`.
8. **Дитина:** створити applicant з guardian; чужий PARENT не читає запис.
9. **Зарахування:** призначити resources, активувати group, enroll; occupancy змінюється атомарно.
10. **Рахунок:** створити monthly/annual invoice; суми та parts — integer minor units.
11. **Платіж:** PARENT створює PENDING; invoice balance ще не змінюється.
12. **Підтвердження:** ADMIN confirms; payment та invoice versions створюються один раз.
13. **Фінансовий звіт:** порівняти accrual, receipts net, expenses, result, cash flow і balances.
14. **Розклад:** generate/update/publish; stale revision/resource conflict не створює version.
15. **Відрахування:** withdraw child і скасувати майбутні invoice parts однією transaction.
16. **Refund:** виконати capped/idempotent refund і показати invoice/payment/refund history.
17. **Audit log:** у test/demo DB показати actor, action, entity/request ID без секретів.
18. **History API:** кожна S2–S8 команда відкриває history свого persisted entity; S1 пояснює shared transaction/counter.
19. **Postman Runner:** запустити всю collection, включно з folder 21 і PARENT 403.
20. **MongoDB Aggregation Framework:** показати pipeline фінансового або operational report і
    зіставити результат з API, не змінюючи дані через `mongosh`.

Після основного flow показати forecast/breakeven/configuration search та developer panel
Demo/API isolation, але не замінювати ними жоден із 20 пунктів.

Для пунктів 17/20 дозволені лише read-only queries у demo database:

```javascript
db.audit_logs.aggregate([
  { $sort: { createdAt: -1 } },
  { $limit: 10 },
  { $project: { actorId: 1, action: 1, entityId: 1, requestId: 1, createdAt: 1 } }
])

db.entity_versions.aggregate([
  { $group: { _id: "$entityType", versions: { $sum: 1 }, entities: { $addToSet: "$entityId" } } },
  { $project: { versions: 1, entityCount: { $size: "$entities" } } },
  { $sort: { _id: 1 } }
])
```

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

Далі повторити list history для `PERSON`, `CATALOG`, `CHILD`, `INVOICE`, `PAYMENT`, `REFUND`,
`EXPENSE` і `SCHEDULE` через готові запити folder 21. Кожна команда пояснює лише власний
business write, але механізм лишається спільним. Матриця owners/reviewers:
[`DATA_HISTORY_TEAM_RESPONSIBILITIES.md`](../team/DATA_HISTORY_TEAM_RESPONSIBILITIES.md).

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
| S1 — integration/audit | clean checkout, config, DI, CI, rs0, shared transaction/counter, audit log | Як rollback/retry не лишає partial або duplicate version? |
| S2 — auth/people | login, actor refresh, roles, DTO/redaction, PERSON history | Як відкликається JWT і чому hash у snapshot редагований? |
| S3 — children | guardian, enrollment, membership/withdrawal, CHILD history | Як rejected transition не створює version? |
| S4 — groups | resources, capacity/occupancy, GROUP history, operations aggregation | Як concurrency не переповнює group і зберігає version order? |
| S5 — catalog/seed | catalog version, repeatable seed, CATALOG history | Чому idempotent seed не створює зайвої version? |
| S6 — schedules | revision/generate/publish, SCHEDULE history | Чому stale revision не змінює data/history? |
| S7 — money flow | exact money, INVOICE/PAYMENT/REFUND history, idempotency | Чому PENDING не змінює receipt/balance? |
| S8 — expenses/reports | EXPENSE history, serviceMonth/paidAt, reports/forecast/panel | Чим result відрізняється від cash flow і чому report не має власної version? |

Реальні GitHub handles слід вписати до початку сесії. Перерозподіл має бути явно погоджений
тімлідом; він не створює окремих history systems і не робить S6 owner історії інших модулів.

## 7. Завершення і sign-off

```bash
npm run infra:down
```

У Issue #62 reviewer залишає exact SHA, дату/час, присутніх, посилання на green CI,
фактичні test/Postman counts, знайдені defects та рішення `accepted` або `changes requested`.
До реального sign-off TASK-040 залишається `In Review`, а реліз у `main` не оголошується.
