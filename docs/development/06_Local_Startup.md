# Локальний запуск, demo seed і перевірка

Оновлено 2026-11-09. Інструкція відповідає MongoDB 8 replica set, authentication, повному TASK-039 seed та поточним npm scripts. Вона не вимагає очищення volume.

## Передумови

- Node.js 22 або новіший;
- Docker Desktop із Compose;
- вільні `127.0.0.1:27017` для MongoDB та `3000` для API.

```powershell
npm ci
Copy-Item .env.example .env
```

У `.env` задайте власні `JWT_SECRET` (щонайменше 32 bytes), URL у `JWT_ISSUER`, `JWT_AUDIENCE`, bootstrap ADMIN fields і `DEMO_PARENT_PASSWORD` (мінімум 12 символів). `.env` не commit-иться; не використовуйте production credentials.

## MongoDB і ADMIN

```powershell
docker compose up -d --wait mongodb
docker compose exec -T mongodb mongosh --quiet /scripts/mongodb-init.js
npm run bootstrap:admin
```

MongoDB працює як single-node `rs0`, бо enrollment, billing, payments, refunds, schedules та audit використовують transactions. Повторний bootstrap не змінює пароль наявного ADMIN.

## Повний demo seed

Seed дозволений лише для `kindergarten_dev` та `kindergarten_seed_test`, ніколи не очищує базу і не приймає довільну URI:

```powershell
$env:SEED_DATABASE = "kindergarten_seed_test"
npm run seed
npm run seed
Remove-Item Env:SEED_DATABASE
```

Другий запуск має показати `inserted: 0` для базових groups/catalog і ті самі scenario counts/statuses. Full scenario містить scoped parents, 11 employees, full/empty/partial groups, 22 children, monthly/annual invoices, pending/confirmed payments, withdrawal/refund, expenses, published schedule та draft. Деталі й Swagger кроки: [demo-seed-status.md](demo-seed-status.md).

## API та Swagger

```powershell
npm start
```

Перевірте:

- `http://127.0.0.1:3000/health/live`;
- `http://127.0.0.1:3000/health/ready`;
- `http://127.0.0.1:3000/api/v1/openapi.json`;
- `http://127.0.0.1:3000/api-docs/`.

Login повертає short-lived JWT. Swagger `Authorize` приймає token для protected operations. Не зберігайте JWT у документах, screenshots або issue comments.

## Перевірки

```powershell
npm run check
npm run test:mongodb
```

`npm test` навмисно skips MongoDB integration cases; лише `npm run test:mongodb` перевіряє transactions і aggregation на `rs0`. Не вважайте unit-only green run повною інтеграційною перевіркою.

## Зупинка без втрати даних

```powershell
docker compose stop mongodb
```

`docker compose down` видаляє containers/network, але не named volume. Не додавайте `--volumes` або `-v`, якщо потрібно зберегти локальні дані.
