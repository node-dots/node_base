# Звіт Postman/Newman

Дата контрольного прогону: 12 листопада 2026 року. Колекція відповідає Postman Collection Schema v2.1 та виконується офіційним образом `postman/newman:6-alpine`.

## Результат

| Показник | Значення |
|---|---:|
| Логічні папки | 20 |
| Статичні запити в collection | 101 |
| Фактично виконані HTTP-запити | 107 |
| Assertions | 608 |
| Failed | 0 |
| Skipped | 0 |
| Результат | PASSED |

Різниця між 101 і 107 виникає через керований цикл login-запитів до фактичного отримання `429 Too Many Requests`. Санітизовані докази: [`postman-summary.json`](../../postman/results/postman-summary.json) і [`postman.junit.xml`](../../postman/results/postman.junit.xml). JUnit та summary перевіряються на відсутність паролів, JWT і полів із секретами.

## Покриття API

Колекція містить усі 65 операцій поточного OpenAPI та додаткові негативні/E2E виклики. Папки: health/readiness, authentication, accounts/roles, people/employees, catalog, groups, children, enrollment/membership, financial rules/benefits, invoices, payments, refunds, expenses/payroll, schedules, financial reports, operational reports, forecast/configuration search, security/permissions, error handling і complete E2E.

Перевіряються реальні status codes `200`, `201`, `400`, `401`, `403`, `404`, `409`, `422`, `429`, JSON-envelope, типи й обов’язкові поля, відсутність секретних полів, role/scope доступ, idempotency, зміни стану та підсумкові aggregation-значення.

Security/error сценарії включають відсутній і підроблений JWT, неправильний пароль, PARENT scope для власної/чужої дитини, заборону PARENT читати працівників і фінанси або виконувати ADMIN write, невірну пагінацію, неіснуючі ресурси, майбутню дату народження, некоректні гроші, unknown route та реальний login rate limit. Відкликання токенів також перевіряється після зміни ролей; ширші matrix-перевірки ролей залишаються у unit/MongoDB integration tests.

## Наскрізний сценарій

Через HTTP послідовно виконано: ADMIN login/profile → каталог → підготовлені seed-працівники → група/ресурси/активація → дитина/guardian/enrollment → occupied seats → suspend/resume → benefit → annual invoice → PENDING payment → ADMIN confirmation → paid balance → finance report → schedule generation/update/publication → withdrawal → refund → refund history → фінальні aggregates.

Використовуються лише runtime ID. Кожен запуск створює базу `kindergarten_test_<uuid>`, одноразові credentials і JWT secret у пам’яті. Після прогону видаляється тільки ця база; наявні volumes і development database не очищаються.

## Знайдено і виправлено

1. Майбутня дата народження спричиняла неочікуваний HTTP 500. Domain rule тепер стабільно повертає безпечний `422 INVALID_DATE_OF_BIRTH`; додано unit та HTTP regression tests.
2. OpenAPI для versioned catalog дозволяв kinds, які service не підтримує. Контракт і route validation звужено до `TUITION_RATE`, `MEAL_RATE`, `BENEFIT`, `PROGRAM`.
3. Mongoose update options використовували deprecated `new: true`. Репозиторії переведено на `returnDocument: "after"` без зміни поведінки.
4. `mongoose@9.11.1` мав high-severity advisories. Оновлено до `9.12.1`; `npm audit` — 0 vulnerabilities.

Під час побудови E2E також виправлено хибні припущення тестових fixtures щодо response envelope, status expense після оплати, шляху revision, benefit assignments і `remainingAmountCents`. Backend-контракти для цих випадків не послаблювалися.

## Відомі межі

- Публічного audit-log HTTP endpoint немає. Запис аудиту перевіряється service/MongoDB integration tests, а не вигаданим Postman route.
- Публічного створення базової Person identity немає; E2E використовує штатний demo seed для працівників/guardian і створює бізнес-ресурси через HTTP.
- Postman Desktop GUI не автоматизовано. Реальний runner — Newman; ручний імпорт описано в [`POSTMAN_GUIDE_UA.md`](POSTMAN_GUIDE_UA.md).

## Відтворення

```bash
npm ci
npm run test:postman
```

Потрібен запущений Docker Desktop. Скрипт сам готує MongoDB replica set, backend, test database та fixtures.
