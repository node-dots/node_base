# GitHub Actions: автоматичні перевірки

Оновлено 18 жовтня 2026 року. Конфігурація: [.github/workflows/ci.yml](../../.github/workflows/ci.yml). Локально перевірено YAML і npm run check. Перший запуск workflow у GitHub та обов’язковість перевірки ще потрібно підтвердити.

## Коли та що запускається

Workflow CI виконується для PR у develop/main і push у ці гілки. На окремій машині ubuntu-latest job **Code checks** отримує код, налаштовує Node.js 24, встановлює залежності через npm ci та запускає npm run check. Максимальний час — 10 хвилин.

npm run check послідовно перевіряє форматування Prettier, синтаксис JavaScript та автоматизовані тести. При помилці наступний крок не виконується, job завершується невдало. Поточні npm-скрипти форматують і перевіряють JS у src/scripts/tests; сам YAML цими скриптами не перевіряється.

MongoDB, Jaeger, .env і секрети для цього job не потрібні. Звичайні тести використовують ізольовані репозиторії в пам’яті; MongoDB-тест без RUN_MONGO_TESTS=true пропускається. Окремий MongoDB-job з replica set — наступна частина TASK-002, не виконана поточним workflow.

GITHUB_TOKEN має лише contents: read; checkout не зберігає облікові дані для подальших Git-команд. Workflow не виконує push, merge чи deployment. Кеш npm прискорює завантаження пакетів; npm ci все одно встановлює залежності за package-lock.json.

## Як перевірити перший PR

1. Закомітити workflow і документацію в chore/github-actions та відправити цю гілку.
2. Створити PR **chore/github-actions → develop**. Один push лише в робочу гілку без PR не запускає цей workflow.
3. На вкладці Checks або Actions відкрити CI → Code checks. Перевірити виконання npm ci та npm run check; очікуються 24 успішні тести й один пропущений MongoDB-тест.
4. Якщо перевірка червона, відкрити невдалий крок, виправити причину локально та зробити новий commit/push у ту саму гілку. PR перевіриться повторно.
5. Після успішного запуску адміністратор додає Code checks як required status check у правила захисту develop/main, зберігаючи щонайменше одне одобрення. Точну назву вибрати зі списку фактичних checks GitHub.

Сам файл workflow не робить перевірку обов’язковою для merge. Потрібне окреме налаштування захисту гілок. Не позначати TASK-002 Done до підтвердження запусків, required checks, окремого MongoDB-job та інших критеріїв картки.

## Перед відправленням змін

```bash
npm run check
```

Якщо падає форматування: npm run format, переглянути diff і повторити npm run check. Якщо падають тести — виправити поведінку або застарілий контракт тесту; не вимикати перевірку заради merge.

[Git-процес команди](../team/GIT_WORKFLOW.md) · [TASK-002](../planning/tasks/10_Jira_Backlog.md#task-002)
