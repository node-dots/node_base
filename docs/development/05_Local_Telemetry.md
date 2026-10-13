# Локальний HTTP tracing без коду в бізнес-модулях

Оновлено 12 жовтня 2026 року. За рішенням користувача прибрано group.tracing.js та обгортки service/repository. Телеметрія працює тільки у спільному HTTP middleware. Команда не підтримує окремі tracing-файли для модулів.

## Що показує Jaeger

Один HTTP-запит створює один span, наприклад POST /api/v1/groups. Видно тривалість усього запиту, статус HTTP, requestId, код помилки та Trace ID. Окремих span service/repository або MongoDB-драйвера немає. Старі трейси з дочірніми кроками залишаються в Jaeger до його перезапуску.

HTTP 4xx позначає відхилений запит; 5xx або переривання — помилку span. Health, OpenAPI і Swagger виключені. Приймається W3C traceparent/tracestate, але не baggage.

## Запуск

Повна інструкція Windows/macOS — [06_Local_Startup.md](06_Local_Startup.md).

```bash
npm run telemetry:up
npm run dev
```

У .env потрібні:

```dotenv
TELEMETRY_ENABLED=true
OTEL_SERVICE_NAME=kindergarten-backend
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://127.0.0.1:4318/v1/traces
NODE_ENV=development
TELEMETRY_DEBUG_DATA=true
```

Без явного TELEMETRY_ENABLED=true SDK вимкнений. Після зміни .env перезапустіть Node.js. Jaeger: http://127.0.0.1:16686; Service: kindergarten-backend. У цій робочій копії API працює на 3100.

## Перегляд даних

Виконайте запит у Swagger, виберіть сервіс у Jaeger та натисніть Find Traces. Відкрийте HTTP-span і розгорніть Tags:

| Атрибут | Значення |
|---|---|
| http.route | Шаблон маршруту без значення ID |
| http.response.status_code | Статус HTTP |
| app.request.outcome | success, rejected або aborted |
| app.error.code | Безпечний код помилки |
| app.debug.request | JSON body, params і query в dev-режимі |
| app.debug.response | JSON відповіді API в dev-режимі |

app.debug.input та app.debug.output внутрішніх операцій більше не збираються. Дані показуються тільки при NODE_ENV=development та TELEMETRY_DEBUG_DATA=true; production/test вимикають їх навіть при прапорці true. Для вимкнення dev-даних задайте TELEMETRY_DEBUG_DATA=false і перезапустіть API.

Trace ID також є в X-Trace-Id та журналі сервера. Конкретний запит відкривається за http://127.0.0.1:16686/trace/<traceId>. Експорт та індексація можуть потребувати кількох секунд.

## Архітектура та нові модулі

| Файл | Відповідальність |
|---|---|
| src/server.js | Запуск SDK та завершення експорту |
| src/config/telemetry.js | Перевірка локальних налаштувань |
| src/telemetry/telemetry.js | Provider, контекст і пакетний exporter |
| src/telemetry/traceDebugData.js | Маскування та обмеження JSON |
| src/middleware/tracing.js | Span HTTP, захоплення JSON та кореляція логів |
| src/app.js | Одне підключення middleware для всіх модулів |
| src/middleware/requestContext.js | requestId та технічний журнал HTTP |

GroupModule створює GroupService та GroupController через new, без телеметрії. Routes, services, repositories, DTO і моделі не імпортують OpenTelemetry. Не потрібно створювати <module>.tracing.js або підтримувати списки операцій чи файлів.

Модулі монтуємо на статичному префіксі, наприклад /api/v1/groups. Middleware бере шаблон зі зіставленого Express route.path; для wildcard та необов’язкових частин використовує сам шаблон без відновлення префікса. Невідомі маршрути позначає як (unmatched). Дані JSON-відповіді отримує через спільну обгортку res.json. Потокові й файлові відповіді не захоплює.

## Дані та надійність

Dev-режим показує бізнес-дані, включно з назвами й ID; для навчання використовуйте вигадані записи. Password, token, secret, authorization, cookie, apiKey, credential і session маскуються рекурсивно за назвою поля. Заголовки, текст/stack винятку не збираються. Фільтр не розпізнає секрет, помилково вписаний у довільний текст.

JSON обмежений за глибиною, кількістю елементів і розміром. Стандартні логи не містять тіл запитів/відповідей. Endpoint експорту перевіряється як локальна HTTP-адреса /v1/traces; порти Jaeger доступні тільки через loopback у compose.yaml.

Експорт пакетний, черга обмежена; недоступність Jaeger не скасовує бізнес-операції. При SIGINT/SIGTERM сервер завершує експорт у межах загального ліміту 5 секунд. Jaeger зберігає трейси в пам’яті; MongoDB-групи переживають перезапуск API. Телеметрія не замінює бізнес-аудит.

## Зупинка та перевірки

```bash
npm run telemetry:down
npm run check
npm run test:mongodb
```

Перша команда зупиняє тільки Jaeger. Check перевіряє HTTP-контекст, приватність, dev-дані, помилки exporter та регресії API. MongoDB-тест запускається окремо на випадковій тестовій базі. Команди Windows — npm.cmd run ... у PowerShell.

Офіційні джерела: [OpenTelemetry JavaScript](https://opentelemetry.io/docs/languages/js/instrumentation/) та [Jaeger 2.21](https://www.jaegertracing.io/docs/2.21/getting-started/).
