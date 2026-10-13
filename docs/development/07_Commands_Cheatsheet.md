# Шпаргалка команд

Команди виконуйте з кореня проєкту. Docker Desktop має бути запущений для MongoDB та Jaeger.

## Перший запуск

Після встановлення залежностей через `npm ci` і створення `.env` за `.env.example`:

```bash
npm run infra:up
npm run seed
npm run dev
```

Seed налаштовує replica set і додає демонстраційні групи. Щодня повторювати його не потрібно; повтор не створює дублів і не перезаписує наявні записи.

## Щоденна робота

| Команда | Призначення |
|---|---|
| `npm run infra:up` | Запустити MongoDB і Jaeger |
| `npm run dev` | Запустити API з перезапуском при зміні коду |
| `npm run format` | Автоматично відформатувати JavaScript |
| `npm run check` | Перевірити формат, синтаксис і тести |
| `npm run infra:down` | Зупинити й видалити контейнери; дані MongoDB зберігаються |

Перед передачею змін команді:

```bash
npm run format
npm run check
```

Ці команди можна виконувати в іншому терміналі, поки працює `dev`.

## За потреби

| Команда | Призначення |
|---|---|
| `npm test` | Тести без окремої перевірки стилю та синтаксису |
| `npm run test:mongodb` | Integration-тест на запущеній MongoDB у власній випадковій базі |
| `npm run start` | Запуск API без автоматичного перезапуску |
| `npm run debug` | Запуск API з Node Inspector на 127.0.0.1:9229 для підключення PhpStorm |
| `npm run seed` | Додати відсутні демонстраційні групи; MongoDB запускається автоматично |
| `npm run telemetry:demo` | Виконати демонстраційні запити до API для перегляду в Jaeger; створює одну групу |
| `npm run telemetry:up` | Запустити тільки Jaeger |
| `npm run telemetry:down` | Зупинити тільки Jaeger |
| `npm run format:check` | Перевірити стиль без зміни файлів |
| `npm run check:syntax` | Перевірити тільки синтаксис JavaScript |
| `npm run docs:export` | Зберегти згенерований OpenAPI у docs/api/openapi.json для передачі іншим інструментам; для роботи Swagger не потрібно |

Демонстрація tracing очікує API на порту 3100 із ввімкненою телеметрією. Для іншого порту задайте `TRACE_DEMO_BASE_URL` за повною інструкцією tracing.

## Зупинка та Windows

- API: `Ctrl+C` у терміналі з `dev` або `start`.
- Контейнери: `npm run infra:down`. Трейси Jaeger після зупинки втрачаються; MongoDB зберігає дані у volume.
- У PowerShell можна використовувати `npm.cmd` замість `npm`, наприклад `npm.cmd run dev`.

Повний запуск Windows/macOS, `.env` та PhpStorm: [06_Local_Startup.md](06_Local_Startup.md). Налаштування tracing: [05_Local_Telemetry.md](05_Local_Telemetry.md).
