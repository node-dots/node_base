# Postman / Newman

Колекція покриває фактичні маршрути з `docs/api/openapi.json`, рольові обмеження, помилки та повний HTTP-сценарій. У JSON немає паролів або токенів.

## Автоматичний запуск

```bash
npm run test:postman
```

Команда використовує Docker Desktop, створює окрему випадкову тестову MongoDB, готує одноразового ADMIN і demo PARENT, запускає backend та офіційний образ `postman/newman:6-alpine`. Після завершення видаляється тільки створена цією командою база.

Результати:

- `postman/results/postman-summary.json` — санітизований підсумок;
- `postman/results/postman.junit.xml` — JUnit без credentials і токенів.

## Postman Desktop

Імпортуйте `Kindergarten_API.postman_collection.json` та `Kindergarten_Local.postman_environment.json`. Значення `adminPassword` і `parentPassword` задайте локально як secret/runtime variables. Детальна інструкція: `docs/testing/POSTMAN_GUIDE_UA.md`.
