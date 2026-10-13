# Backend дитячого садка

Навчальний модульний моноліт на JavaScript ESM, Express і MongoDB. Структуру спрощено 12 жовтня 2026 року для команди студентів: плоскі модулі, service, repository, DTO та ручний DI через конструктори.

- [Запуск на Windows і macOS, MongoDB, seed та PhpStorm](docs/development/06_Local_Startup.md).
- [Коротка шпаргалка npm-команд](docs/development/07_Commands_Cheatsheet.md).
- [Знайомство команди з каркасом — документ для презентації](docs/team/08_Team_Introduction.md).
- [План командної розробки та перші задачі для 8 учасників](docs/planning/plans/09_Team_Delivery_Plan.md).
- [Backlog у форматі Jira: Epic, задачі, залежності та критерії приймання](docs/planning/tasks/10_Jira_Backlog.md).
- [Діаграма Ганта: строки, пріоритети 1–10, залежності та черга команди](docs/planning/gantt/13_Gantt_Plan.md).
- [Генерація Swagger із Zod: як додавати та документувати API](docs/development/11_OpenAPI_Generation.md).
- [Архітектура: де писати код і як працює DI](docs/architecture/02_Architecture_Decisions.md).
- [Чинні бізнес-вимоги](docs/requirements/00_Consolidated_Requirements.md).
- [Бізнес-ланцюжки: що з чим взаємодіє та які зміни перетинаються](docs/architecture/12_Business_Flows.md).
- [Tracing у Jaeger](docs/development/05_Local_Telemetry.md).
- [Карта сутностей майбутньої системи](docs/architecture/04_Entity_Diagrams.md).
- [Стан реалізації та наступні кроки](docs/planning/plans/Implementation_Plan.md).

[Зміст документації](docs/README.md) · [Плани та задачі](docs/planning/README.md).

## Що працює

| Метод і шлях | Результат |
|---|---|
| GET /health/live | Стан процесу |
| GET /health/ready | Перевірка з’єднання й ping MongoDB: 200 READY або 503 NOT_READY |
| GET /api/v1 | Назва, версія та посилання на Swagger/OpenAPI |
| GET /api/v1/groups | Список груп із MongoDB, meta.total |
| GET /api/v1/groups/:id | Група зі строковим id |
| POST /api/v1/groups | Створення DRAFT-групи та HTTP 201 |
| GET /api/v1/groups/summary | Aggregation: кількість груп і місткість за віком |
| GET /api/v1/openapi.json | Поточний OpenAPI-контракт |
| GET /api-docs/ | Локальний Swagger UI |

Записи зберігаються після перезапуску Node.js. Seed додає 8 вигаданих груп і зберігає ручні зміни. API використовує ту саму kindergarten_dev.groups, яку видно в PhpStorm. Пагінація, авторизація та інші бізнес-модулі ще не реалізовані.

Helmet, загальний rate limit, окремий ліміт запису, обмеження JSON, HTTP-тайм-аути та безпечні помилки збережені. Tracing показує один HTTP-span на запит і дозволяє dev-перегляд JSON запиту/відповіді з маскуванням секретних полів. У бізнес-модулях немає tracing-коду.

## Перевірки

- npm run check — форматування, синтаксис і тести без Docker.
- npm run test:mongodb — окрема перевірка на запущеній MongoDB, ізольована випадкова база.

Числові обмеження й коди визначені константами. Код та коментарі українською; ідентифікатори англійською. Великі наступні функції додаємо невеликими завершеними сценаріями.

Реєстрація всіх бізнес-модулів — src/modules/index.js. app.js отримує готовий router і не залежить від конкретних моделей. Єдиний стиль підтримується npm run format; це dev-інструмент, без додаткових викликів під час роботи API.

Swagger отримує OpenAPI, згенерований зі схем Zod та описів операцій модулів. Сервер більше не читає docs/api/openapi.json; це лише експорт, який за потреби оновлює npm run docs:export. Після отримання нових залежностей виконайте npm ci.
