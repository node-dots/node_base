# Навігація документації

Оновлено 14 жовтня 2026 року. Бізнес-вимоги, пояснення коду й командні задачі мають окремі папки. Усі внутрішні посилання відносні: навігація працює після clone або перенесення проєкту.

## З чого почати

1. [Що будуємо — чинні вимоги](requirements/00_Consolidated_Requirements.md).
2. [Як пов’язані бізнес-блоки](architecture/12_Business_Flows.md).
3. [Де писати код](architecture/02_Architecture_Decisions.md).
4. [Як запустити локально](development/06_Local_Startup.md).
5. [Яку задачу взяти](planning/tasks/10_Jira_Backlog.md) та [коли її виконувати](planning/gantt/13_Gantt_Plan.md).

## Розділи

### Вимоги та першоджерела — `requirements/`

Що будуємо, правила бізнесу та оригінальні Word-завдання.

- [Чинне ТЗ з посиланнями на задачі](requirements/00_Consolidated_Requirements.md).
- [Попередня специфікація](requirements/01_Project_Specification.md).
- [Початкове завдання](requirements/sources/Умови_завдання.docx).
- [Початковий фінансовий приклад](requirements/sources/Фінанси.docx).

### Архітектура та бізнес-зв’язки — `architecture/`

Де писати код, хто володіє даними, які правила перетинаються.

- [Архітектура та DI](architecture/02_Architecture_Decisions.md).
- [Ролі, дозволи та політики](architecture/03_Access_Control.md).
- [Діаграми сутностей](architecture/04_Entity_Diagrams.md).
- [Логічні блоки та бізнес-ланцюжки](architecture/12_Business_Flows.md).

### Інструкції розробника — `development/`

Запуск, MongoDB, seed, debugger, команди, tracing і Swagger.

- [Запуск Windows/macOS та MongoDB](development/06_Local_Startup.md).
- [Шпаргалка команд](development/07_Commands_Cheatsheet.md).
- [Tracing у Jaeger](development/05_Local_Telemetry.md).
- [Генерація Swagger](development/11_OpenAPI_Generation.md).
- [Технічний контекст та журнал співпраці](development/PROJECT_CONTEXT.md).

### Робота команди — `team/`

Презентація каркаса й правила Git/PR.

- [Знайомство з проєктом](team/08_Team_Introduction.md).
- [Git-процес команди](team/GIT_WORKFLOW.md).

### Плани, задачі та строки — `planning/`

Окремий розділ керування роботою; тут немає дубля бізнес-вимог.

- [Навігація планування](planning/README.md).
- [План для восьми учасників](planning/plans/09_Team_Delivery_Plan.md).
- [Детальні картки задач](planning/tasks/10_Jira_Backlog.md).
- [Гант: дати, пріоритети, залежності](planning/gantt/13_Gantt_Plan.md).
- [Попередній план і журнал реалізації](planning/plans/Implementation_Plan.md).

### Експорт API — `api/`

Згенерований контракт для зовнішніх інструментів. Сервер бере його з коду.

- [JSON-експорт OpenAPI](api/openapi.json).
- [Пагінація груп: контракт і перевірки](api/groups-pagination.md).

### Допоміжні інструменти — `tools/`

Збережена демопанель: окремий інструмент читання, не реалізований продуктовий frontend.

- [Інструкція панелі](tools/developer-panel/README.md).
- [Демопанель](tools/developer-panel/index.html).

## Правила підтримки

Змінюємо бізнес-правило в requirements, пов’язані задачі — у planning/tasks, строки — у planning/gantt. Інструкції запуску й API-генерації оновлюємо в development. Стабільні anchors req-*, task-* та gantt-task-* зберігаємо. Посилання на картку не означає, що функція реалізована.

Архівні Word-документи в requirements/sources зберігаємо без редагування. planning/plans/Implementation_Plan.md залишається журналом; чинні правила визначає requirements/00_Consolidated_Requirements.md. Gantt PNG/SVG лежать у planning/gantt/assets.

docs/api/openapi.json — лише експорт: для оновлення npm run docs:export. HTTP-адреси /api-docs/ та /api/v1/openapi.json залишаються тими самими. Локальну HTML-навігацію можна відкрити через [index.html](index.html); демопанель збережена окремо в tools.
