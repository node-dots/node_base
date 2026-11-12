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
- [Postman/Newman: локальний запуск та імпорт у Desktop](docs/testing/POSTMAN_GUIDE_UA.md).
- [Фактичний фінальний статус](docs/testing/FINAL_PROJECT_STATUS.md).
- [Сценарій захисту](docs/testing/DEFENSE_SCENARIO.md).

[Пагінація груп: контракт і приклади](docs/api/groups-pagination.md).

[GitHub Actions: запуск і налаштування обов’язкових перевірок](docs/development/08_GitHub_Actions.md).

[Зміст документації](docs/README.md) · [Плани та задачі](docs/planning/README.md).

## Що працює

Реалізовано 65 OpenAPI-операцій: health/readiness, JWT authentication, accounts/roles, people/employees, catalog, groups, children, enrollment, financial rules/benefits, invoices, payments, refunds, expenses/payroll, schedules, financial and operational reports, forecast та configuration search. Дані зберігаються в MongoDB replica set; грошові й membership-операції використовують транзакції, Zod-контракти та role/scope permissions.

Основні локальні адреси після `npm start`:

| Адреса | Призначення |
|---|---|
| `http://127.0.0.1:3000/health/live` | Стан процесу |
| `http://127.0.0.1:3000/health/ready` | MongoDB readiness |
| `http://127.0.0.1:3000/api-docs/` | Swagger UI |
| `http://127.0.0.1:3000/api/v1/openapi.json` | Актуальний OpenAPI JSON |

`npm run seed` і bootstrap зберігають наявні записи та працюють лише з дозволеними development/test базами. Секрети й паролі задаються через runtime environment, а не зберігаються в репозиторії.

Helmet, загальний rate limit, окремий ліміт запису, обмеження JSON, HTTP-тайм-аути та безпечні помилки збережені. Tracing показує один HTTP-span на запит і дозволяє dev-перегляд JSON запиту/відповіді з маскуванням секретних полів. У бізнес-модулях немає tracing-коду.

## Перевірки

- npm run check — форматування, синтаксис і тести без Docker.
- npm run test:mongodb — окрема перевірка на запущеній MongoDB, ізольована випадкова база.
- npm run test:panel-browser — браузерні стани та реальний ADMIN/API/MongoDB сценарій панелі.
- npm run test:postman — 20 папок, усі OpenAPI-операції, security/error cases і повний HTTP E2E через Newman.
- npm run test:all — послідовний запуск усіх перелічених перевірок.

Числові обмеження й коди визначені константами. Код та коментарі українською; ідентифікатори англійською. Великі наступні функції додаємо невеликими завершеними сценаріями.

Реєстрація всіх бізнес-модулів — src/modules/index.js. app.js отримує готовий router і не залежить від конкретних моделей. Єдиний стиль підтримується npm run format; це dev-інструмент, без додаткових викликів під час роботи API.

Swagger отримує OpenAPI, згенерований зі схем Zod та описів операцій модулів. Сервер більше не читає docs/api/openapi.json; це лише експорт, який за потреби оновлює npm run docs:export. Після отримання нових залежностей виконайте npm ci.
