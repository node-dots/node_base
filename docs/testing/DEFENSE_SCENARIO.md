# Сценарій фінального захисту

## 1. Запуск із нуля

```bash
git clone https://github.com/node-dots/node_base.git
cd node_base
npm ci
npm run infra:up
npm run check
npm run test:mongodb
```

Скопіюйте потрібні значення з `.env.example` у власний локальний `.env`, задайте випадковий `JWT_SECRET` і test ADMIN credentials, потім:

```bash
npm run bootstrap:admin
npm run seed
npm start
```

Покажіть `/health/live`, `/health/ready`, `/api-docs/` та `/api/v1/openapi.json`. У MongoDB виконайте `rs.status().myState`: значення `1` означає PRIMARY.

## 2. Як пояснити архітектуру

- **Node.js** виконує JavaScript backend і неблокувальний HTTP I/O.
- **Express** маршрутизує запити та складає middleware pipeline.
- **MongoDB** зберігає документи; replica set потрібен для multi-document transactions.
- **Mongoose** описує persistence models, indexes і repositories.
- **Zod schema** перевіряє вхід та є джерелом OpenAPI-контракту.
- **DTO** обмежує поля відповіді й не дозволяє випадково віддати password hash або внутрішні дані.
- **Route/controller** приймає HTTP, **service** виконує business rules, **repository** ізолює MongoDB.
- **DI** передає залежності через конструктори; service можна тестувати без глобальних singleton.
- **JWT** підтверджує identity, але актуальні roles/tokenVersion повторно читаються з бази; зміна ролі відкликає старий token.
- **Middleware** відповідає за security headers, rate limit, auth, validation, tracing і safe errors.
- **Transaction** атомарно змінює кілька документів: або всі записи commit, або всі rollback.
- **Postman/Newman** виконує справжні HTTP-запити та assertions незалежно від внутрішніх класів.

## 3. Жива демонстрація

1. Login ADMIN і `/auth/me`; у response немає password/hash.
2. Swagger: показати 65 операцій і Bearer Auth.
3. Groups CRUD: DRAFT → resources → ACTIVE; показати capacity/occupied seats.
4. Створити child, guardian link і enrollment; повторна/некоректна операція дає domain error.
5. Показати invoice, PENDING payment, ADMIN confirm і зміну balance.
6. Показати refund після withdrawal та history.
7. Створити expense lifecycle й monthly finance report; суми зберігаються в integer minor units.
8. Згенерувати, оновити й опублікувати schedule; конфлікти кімнати/працівника блокуються.
9. Показати aggregation reports, forecast і configuration search із assumptions/budget.
10. Відкрити developer panel у Demo, потім API mode; наголосити, що режими не змішуються і JWT не зберігається в localStorage.

Для стислої та повністю відтворюваної демонстрації запустіть:

```bash
npm run test:postman
```

Поясніть: 20 папок, 101 статичний request, 107 фактичних викликів, 608 assertions, 0 failures. Випадкова test database видаляється після run, development data не чіпаються.

## 4. Транзакції та безпека

Покажіть service з `UnitOfWork`, а потім негативний HTTP-тест: наприклад, повторний enrollment або idempotency key з іншим payload. Очікувано повертається `409/422`, а пов'язані документи не переходять у частково змінений стан.

Далі покажіть `401` без token, `403` для PARENT на ADMIN route, `404` для чужої scoped дитини й `429` після login limit. Підкресліть, що tests не вимикають auth/validation і не використовують production database.

## 5. Типові питання викладача

**Чому не зберігати гроші як float?** Щоб уникнути похибок IEEE-754; суми зберігаються цілими cents/minor units.

**Навіщо repository, якщо є Mongoose?** Repository приховує persistence details, стабілізує контракт service і спрощує unit tests.

**Чим schema відрізняється від DTO?** Schema валідовує форму/правила вводу; DTO явно формує дозволений вихід.

**Навіщо replica set локально?** MongoDB transactions працюють через session у replica set, навіть якщо node один.

**Чому JWT недостатньо перевірити криптографічно?** Роль або account status могли змінитися; база й `tokenVersion` відкликають старі tokens.

**Як доведено, що API працює разом?** Newman запускає повний HTTP flow на реальному Express/MongoDB, а не викликає services напряму.

**Чи все завершено на 100%?** Технічний пакет зелений, але TASK-001, TASK-010 і TASK-040 потребують командних/незалежних підтверджень; це чесно залишено відкритим.

## 6. Завершення презентації

Покажіть санітизований Postman summary/JUnit, два browser screenshots, GitHub Actions поточного PR і список трьох відкритих організаційних tasks. Не демонструйте `.env`, passwords, JWT або raw authorization headers.
