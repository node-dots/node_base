# Postman: інструкція українською

## Автоматичний рекомендований запуск

1. Встановіть Node.js 24, Git і Docker Desktop.
2. У корені репозиторію виконайте:

```bash
npm ci
npm run test:postman
```

Команда генерує актуальну collection/environment, піднімає MongoDB replica set, створює ізольовану випадкову test database, bootstrap ADMIN і demo fixtures, запускає backend та Newman. Exit code буде `1`, якщо хоча б один assertion не пройде.

Звіти з'являться в `postman/results/`. Вони санітизовані; raw Newman output із runtime credentials не комітиться.

## Імпорт у Postman Desktop

1. Відкрийте Postman → **Import**.
2. Імпортуйте [`Kindergarten_API.postman_collection.json`](../../postman/Kindergarten_API.postman_collection.json).
3. Імпортуйте [`Kindergarten_Local.postman_environment.json`](../../postman/Kindergarten_Local.postman_environment.json).
4. Виберіть environment **Kindergarten Local**.
5. Переконайтеся, що `baseUrl` відповідає запущеному серверу, типово `http://127.0.0.1:3000`.

Environment містить `baseUrl`, `adminEmail`, `accessToken`, `parentToken`, `groupId`, `childId`, `employeeId`, `invoiceId`, `paymentId`, `scheduleId`, `currentMonth`, `schoolYear` та допоміжні змінні. ID і tokens заповнюються response scripts під час runner. Паролі й tokens у JSON навмисно порожні.

## Безпечні credentials для ручного запуску

Не записуйте password/JWT у collection, Git або screenshot. Для локального ADMIN задайте змінні процесу за `.env.example`, не перезаписуючи чужий `.env`, і виконайте:

```bash
npm run infra:up
npm run bootstrap:admin
npm run seed
npm start
```

У Postman додайте `adminEmail`, `adminPassword` і `parentPassword` лише як local/current values або Postman Vault secrets. `Login as ADMIN` і `Login as PARENT` самі збережуть отримані access tokens лише в активний runtime environment.

## Запуск Collection Runner

1. Відкрийте collection → **Run collection**.
2. Виберіть усі 20 папок у наявному порядку.
3. Виберіть **Kindergarten Local**.
4. Не вмикайте збереження response bodies у спільний cloud workspace, якщо там можуть бути тестові персональні дані.
5. Натисніть **Run Kindergarten API**.
6. Очікуваний результат: усі assertions зелені, а остання папка завершує E2E aggregates.

Ручний Desktop runner використовує вже запущену базу. Для повністю ізольованого й автоматично очищуваного прогону використовуйте `npm run test:postman`.

## Окремі запити

- Для health, Swagger/OpenAPI authentication не потрібна.
- Для захищених routes collection автоматично додає `Bearer {{accessToken}}` або `Bearer {{parentToken}}`.
- Не підставляйте довільні ObjectId: спочатку виконайте create/list request, який заповнює відповідну runtime variable.
- Після зміни ролей старий token навмисно відкликається; виконайте refresh-login request.
- Login rate-limit test робить кілька запитів і має завершитися `429`; запускайте його останнім серед login-сценаріїв.

## Якщо тест не проходить

Перевірте `GET /health/ready`, Docker container health і `rs.status().myState == 1`. Потім звірте response code/body з актуальним `GET /api/v1/openapi.json`; не використовуйте застарілі приклади. Для автоматичного прогону дивіться JUnit і summary, але не публікуйте raw logs із credentials.
