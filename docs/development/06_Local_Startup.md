# Локальний запуск: MongoDB, демонстраційні дані та PhpStorm

Оновлено: 12 жовтня 2026 року. Інструкція відповідає поточним `compose.yaml`, `package.json` і seed-скриптам. Це основний документ запуску для команди; при зміні команд, портів, підключення або seed оновлюємо його в тій самій задачі.

## Поточний результат

Кожен учасник має власну локальну MongoDB та окремі дані. Seed додає 8 вигаданих груп у базу `kindergarten_dev`, колекцію `groups`.

**Backend використовує MongoDB.** PhpStorm і Swagger/API читають одну kindergarten_dev.groups. Створені через API записи зберігаються після перезапуску Node.js. GET /api/v1/groups/summary показує aggregation-звіт за віком.

## Що встановити

- Node.js 22 або новіший; рекомендована версія команди — 24.
- Docker Desktop із Docker Compose. Перед командами запустіть Docker Desktop і дочекайтеся готовності.
- PhpStorm із увімкненим плагіном Database Tools and SQL — для перегляду бази.

Окремо встановлювати MongoDB та mongosh на комп’ютер не потрібно: вони є в контейнері. Команди нижче виконуйте в терміналі з кореня проєкту, де лежать `package.json` і `compose.yaml`.

Перевірка інструментів:

```bash
node --version
docker compose version
docker info
```

## Перший запуск на macOS

1. Встановіть Node.js 24 та Docker Desktop для вашого процесора; запустіть Docker Desktop.
2. Відкрийте Terminal або термінал PhpStorm у корені проєкту.
3. Виконайте:

```bash
npm ci
cp -n .env.example .env
npm run infra:up
npm run seed
npm run dev
```

Наявний .env не перезаписуйте. Якщо порт 3000 зайнятий, змініть PORT у .env на 3100 і перезапустіть API. Альтернатива для одного запуску: PORT=3100 npm run dev.

## Перший запуск на Windows

1. Встановіть Node.js 24 для Windows та Docker Desktop із WSL 2; увімкніть Linux containers і запустіть Docker Desktop.
2. Відкрийте PowerShell у корені проєкту.
3. Виконайте:

```powershell
npm.cmd ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm.cmd run infra:up
npm.cmd run seed
npm.cmd run dev
```

Використовуємо npm.cmd, щоб команда не залежала від дозволу виконувати npm.ps1 у PowerShell. Наявний .env зберігається. Для іншого порту змініть PORT у .env або задайте перед запуском:

```powershell
$env:PORT = '3100'
npm.cmd run dev
```

Після зупинки Ctrl+C змінну можна прибрати: Remove-Item Env:PORT. Інструкція розрахована на Docker Desktop із Linux containers; запуск на фізичній Windows-машині в цій сесії не перевірявся.

На обох ОС спочатку має з’явитися «Підключено до MongoDB», потім адреса HTTP-сервера. Swagger: http://127.0.0.1:3000/api-docs/ або вибраний порт. Jaeger: http://127.0.0.1:16686.

Swagger автоматично отримує документ зі схем Zod й описів операцій під час створення застосунку; окремої команди генерації для запуску немає. Після отримання оновлених залежностей виконайте npm ci (Windows: npm.cmd ci). Для експорту JSON за потреби — npm run docs:export / npm.cmd run docs:export; Docker для цього не потрібний. У dev зміни коду перезапускають сервер; start/debug потрібно перезапустити вручну, потім оновити сторінку браузера. Подробиці — [генерація OpenAPI](11_OpenAPI_Generation.md).

## Як працює MongoDB та seed


```bash
npm ci
npm run seed
```

`npm ci` встановлює залежності за `package-lock.json`. `npm run seed` самостійно:

1. Запускає сервіс `mongodb` із `compose.yaml`.
2. Чекає успішного healthcheck — відповіді бази на ping.
3. Ініціалізує replica set `rs0`, якщо він ще не налаштований.
4. Чекає PRIMARY — вузла, готового приймати записи.
5. Додає відсутні демонстраційні записи.

Перевірка service-функції `buildGroupDraft` виконується під час завантаження seed-даних, перед Docker-командами. Невалідні приклади не потраплять у базу.

Перший запуск може завантажувати образ `mongo:8.0`. Очікуваний підсумок на порожній базі:

```json
{"database":"kindergarten_dev","inserted":8,"existing":0,"total":8}
```

При повторі:

```json
{"database":"kindergarten_dev","inserted":0,"existing":8,"total":8}
```

`inserted` — додані записи; `existing` — уже наявні демонстраційні записи; `total` — усі групи в базі, включно з доданими вручну. Тому `total` може перевищувати 8.

Не потрібно вручну виконувати `rs.initiate` або створювати базу й колекцію. Seed не потребує `.env` і не запускає Jaeger.

## Які дані додаються

| Вік | Група | Місткість |
|---|---|---|
| 2 | Сонечка | 20 |
| 2 | Зайченята | 16 |
| 3 | Зірочки | 20 |
| 3 | Капітошки | 18 |
| 4 | Веселка | 20 |
| 4 | Мандрівники | 18 |
| 5 | Дослідники | 20 |
| 5 | Мрійники | 16 |

Усі записи мають `status: DRAFT`: це чернетки без дітей, кімнат та призначеного персоналу. Інші бізнес-колекції ще не заповнюються.

Seed використовує сталі ObjectId і `$setOnInsert`. Повторний запуск додає тільки відсутні демонстраційні записи, не перезаписує ручні зміни й не видаляє сторонні записи. Якщо видалили демонстраційну групу, наступний seed відновить її. Seed не виконується автоматично при запуску API.

Приклади лежать у `scripts/demo-groups.js`. Кожен приклад має сталий seedId: не змінюйте його для наявної групи, новій призначайте новий унікальний номер. Порядок прикладів не впливає на ID. Ініціалізація replica set — `scripts/mongodb-init.js`, запуск seed — `scripts/seed.js`.

## Перегляд через Database у PhpStorm

1. Відкрийте **View → Tool Windows → Database**.
2. Натисніть **+ → Data Source → MongoDB**.
3. У налаштуваннях виберіть підключення **URL only** та вставте:

   ```text
   mongodb://127.0.0.1:27017/kindergarten_dev?replicaSet=rs0&directConnection=true
   ```

4. Авторизація — **No auth**: наша локальна MongoDB не має логіна та пароля.
5. Якщо IDE показує **Download missing driver files**, завантажте драйвер.
6. Натисніть **Test Connection**, потім **OK**.
7. Розгорніть `kindergarten_dev → groups` і відкрийте колекцію подвійним натисканням.

Якщо база не відображається, у вкладці **Schemas** налаштувань джерела даних виберіть `kindergarten_dev` та оновіть дерево. Якщо панелі Database немає, перевірте плагін Database Tools and SQL.

`directConnection=true` підходить для нашого одного Docker-вузла: клієнт використовує саме адресу `127.0.0.1:27017`. Це локальна адреса комп’ютера кожного учасника.

Офіційна інструкція інтерфейсу: [MongoDB у PhpStorm](https://www.jetbrains.com/help/phpstorm/mongodb.html).

## Перевірка через термінал

Стан контейнера:

```bash
docker compose ps mongodb
```

Кількість груп:

```bash
docker compose exec mongodb mongosh kindergarten_dev --eval 'db.groups.countDocuments()'
```

Усі записи:

```bash
docker compose exec mongodb mongosh kindergarten_dev --eval 'db.groups.find().toArray()'
```

## Щоденний запуск і зупинка

Запуск тільки MongoDB зі збереженими даними:

```bash
docker compose up -d mongodb
```

Для додавання відсутніх демоданих достатньо знову виконати `npm run seed`. Запуск MongoDB разом із Jaeger:

```bash
npm run infra:up
```

`infra:up` запускає контейнери; одноразову ініціалізацію replica set виконує саме `seed`.

Зупинка тільки MongoDB:

```bash
docker compose stop mongodb
```

Зупинка та видалення контейнерів MongoDB і Jaeger:

```bash
npm run infra:down
```

Дані MongoDB залишаються в іменованому volume `mongodb_data`; звичайний `down` його не видаляє. Трейси Jaeger зберігаються в пам’яті й після зупинки втрачаються. Не додавайте `--volumes` / `-v` до `down`, якщо хочете зберегти базу. [Поведінка Docker Compose down](https://docs.docker.com/reference/cli/docker/compose/down/).

## Налаштування підключення backend

Mongoose 9.11.1 встановлено. config/database.js перевіряє MONGO_URI, відкриває та закриває з’єднання; server.js чекає базу перед запуском HTTP. У .env та .env.example є адреса:

```dotenv
MONGO_URI=mongodb://127.0.0.1:27017/kindergarten_dev?replicaSet=rs0&directConnection=true
```

При недоступній MongoDB сервер завершується помилкою; автоматичного переходу на сховище в пам’яті немає.

Для macOS/Linux створіть `.env`, якщо його ще немає:

```bash
cp -n .env.example .env
npm run dev
```

У Windows можна скопіювати `.env.example` у `.env` через IDE. Наявний `.env` не перезаписуйте. API за замовчуванням працює на порту 3000; якщо він зайнятий, задайте `PORT=3100` у `.env` перед запуском.

Swagger: `http://127.0.0.1:3000/api-docs/` або той самий URL із вибраним портом. Зупинка Node.js — Ctrl+C. Поточна робоча копія запускалася на 3100.

Для tracing запустіть Jaeger через `npm run telemetry:up`. Інструкція налаштування та перегляду трейсів — [05_Local_Telemetry.md](05_Local_Telemetry.md).

## Якщо запуск не вдався

| Повідомлення або симптом | Що перевірити |
|---|---|
| Docker daemon недоступний | Запустіть Docker Desktop і перевірте `docker info` |
| Порт 27017 зайнятий | Перевірте інший локальний MongoDB або контейнер; звільніть порт для цього проєкту |
| Завантаження образу не завершилося вчасно | Виконайте `docker compose pull mongodb`, потім повторіть seed |
| MongoDB не стала PRIMARY | Перегляньте `docker compose logs mongodb`; seed можна повторити |
| PhpStorm не бачить груп | Перевірте успішний seed, базу `kindergarten_dev`, вкладку Schemas і оновіть дерево |
| Дані PhpStorm відрізняються від Swagger | Перевірте назву бази, порт запущеного API й оновіть дані в IDE |

## Перевірки коду та бази

На macOS виконайте npm run check та npm run test:mongodb; у PowerShell — npm.cmd run check та npm.cmd run test:mongodb. Друга команда потребує запущеної MongoDB. Вона створює власну випадкову kindergarten_test_* і видаляє тільки цю базу, не kindergarten_dev.

### Ізольована перевірка seed

Для macOS:

```bash
SEED_DATABASE=kindergarten_seed_test npm run seed
```

Для PowerShell:

```powershell
$env:SEED_DATABASE = 'kindergarten_seed_test'
npm run seed
Remove-Item Env:SEED_DATABASE
```

Дозволені тільки `kindergarten_dev` та `kindergarten_seed_test`. Команда seed не читає `SEED_DATABASE` із `.env`: для тесту задавайте змінну в терміналі. За замовчуванням використовується база розробки. Загальна перевірка npm run check перевіряє форматування, синтаксис та тести без Docker й не очищає ці бази.

Перевірено в поточній робочій копії: додавання 8 груп, повтор без дублів, збереження ручної правки та сторонньої групи в ізольованій базі. Підключення через конкретну інсталяцію PhpStorm перевіряється користувачем через Test Connection.

## Debug у PhpStorm

Зупиніть звичайний dev-процес перед запуском debug, щоб звільнити порт API. MongoDB залиште працювати. На macOS:

```bash
PORT=3100 npm run debug
```

У PowerShell:

```powershell
$env:PORT = '3100'
npm.cmd run debug
```

Має з’явитися Debugger listening on ws://127.0.0.1:9229/... та повідомлення запуску API. У PhpStorm створіть Run → Edit Configurations → + → Attach to Node.js/Chrome, Host 127.0.0.1, Port 9229. Запустіть цю конфігурацію через Debug.

Поставте breakpoint на виконуваному рядку controller/service і виконайте відповідний запит зі Swagger або Postman на порт 3100. Порт 9229 — тільки debugger, HTTP-запити йдуть на 3100. Debug-команда працює без watch; після редагування коду перезапустіть процес і під’єднайте IDE повторно.

Якщо Cannot connect to 9229, перевірте повідомлення Debugger listening. Звичайний dev не вмикає Inspector. Параметр --inspect-port лише задає адресу; Inspector вмикається через --inspect. Поточний Inspector перевіряється за http://127.0.0.1:9229/json/list.

## Форматування коду

На macOS: npm run format. У PowerShell: npm.cmd run format. Команда використовує встановлений через npm ci Prettier та форматує JavaScript. Для перевірки без зміни файлів — npm run format:check / npm.cmd run format:check. Ця перевірка включена у check.

Складання бізнес-модулів тепер лежить у src/modules/index.js; команди запуску та підключення PhpStorm не змінилися. GET /api/v1 повертає версію з package.json та посилання на Swagger/OpenAPI замість ручного списку маршрутів.

## Перевірка готовності MongoDB

Після запуску API відкрийте `/health/ready` на його порту, наприклад http://127.0.0.1:3100/health/ready. Endpoint також є в Swagger у розділі «Стан».

- `200` і `{"data":{"status":"READY","storage":"MONGODB"}}` — з’єднання відкрите й ping успішний.
- `503` і `{"data":{"status":"NOT_READY","storage":"MONGODB"}}` — сховище не відповідає або з’єднання відсутнє.
- `/health/live` перевіряє лише процес і не залежить від успішності ping.

Ping має ліміт 2 секунди; адреса підключення й технічні помилки у відповідь не потрапляють. Перевірка використовує існуюче з’єднання, не створює нове на кожний запит. Втрата сховища після запуску дає 503; якщо MongoDB недоступна вже під час старту, сервер завершується до відкриття HTTP-порту, тому отримати health-відповідь від нього неможливо.

На macOS перевірки: `npm run check` та `npm run test:mongodb`; у PowerShell — `npm.cmd run check` та `npm.cmd run test:mongodb`. Інтеграційний тест перевіряє 200 → закриття власного тестового з’єднання → 503 при живому процесі → повторне підключення. Спільна MongoDB й база розробки не зупиняються та не очищуються.

У коді `server.js` передає `isMongoReady` як `isStorageReady` у `createApp`. Якщо залежність не передана, readiness повертає 503, а не обіцяє готовність неперевіреного сховища. У HTTP-тестах перевірку передаємо явно; сам ping тестуємо окремо.
