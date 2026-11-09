# Developer panel (TASK-037)

Статична read-only панель для перевірки актуального `node_base` API. Вона має два ізольовані режими:

- **API** — лише реальні захищені GET-запити; при помилці фінансові значення очищаються, а не замінюються demo-даними.
- **Demo** — локальний набір прикладів із поміткою `DEMO`; мережеві запити не виконуються.

## Запуск

Запустіть backend і статичний сервер з кореня репозиторію:

```bash
npm start
npx http-server docs/tools/developer-panel -p 8088 -a 127.0.0.1 -c-1
```

Відкрийте `http://127.0.0.1:8088`. Development CORS дозволяє тільки цей точний origin і тільки `GET/OPTIONS` із заголовками `Authorization, Accept`, коли development panel увімкнена у server config; wildcard і credentials не використовуються. JWT вводиться після login через Swagger/API, зберігається лише у приватному полі JS-клієнта та очищається з input одразу після підключення. Не вставляйте production-токени у development panel.

## Реальні контракти

Панель використовує поточний `/api/v1/openapi.json`, а не історичні URL:

| Дані | GET endpoint | Permission |
| --- | --- | --- |
| Current user | `/api/v1/auth/me` | authenticated |
| Groups | `/api/v1/groups?page&pageSize` | `GROUPS_READ` |
| Children | `/api/v1/children?page&pageSize` | `CHILDREN_READ` |
| Employees | `/api/v1/people/employees?page&pageSize` | `PEOPLE_READ` |
| Invoices | `/api/v1/invoices?month&page&pageSize` | `REPORTS_FINANCE_READ` |
| Current balances | `/api/v1/invoices/current-balances` | `INVOICES_READ` |
| Payments | `/api/v1/payments?month&page&pageSize` | `REPORTS_FINANCE_READ` |
| Expenses | `/api/v1/expenses?month&page&pageSize` | `EXPENSES_READ` |
| Published schedule | `/api/v1/schedules/{weekStart}/published` | `SCHEDULES_READ` |
| Monthly finance | `/api/v1/reports/finance/monthly?month` | `REPORTS_FINANCE_READ` |

`selectedMonth` завжди передається як `YYYY-MM`; розклад — за понеділком `weekStart`. Поточні залишки не є історичними: UI показує `currentOutstandingMinor`, `currentOverdueMinor`, `currentRefundDueMinor` та обов’язковий `asOf`. Суми API названі `Minor` або `Cents` відповідно до DTO й відображаються без floating-point обчислень бізнес-логіки.

## Стани і безпека

Панель окремо показує loading, empty, stale (після 5 хвилин), 401, 429 із `Retry-After`, timeout, offline, contract і загальні HTTP errors. Вона не виконує write-запитів, не пише JWT у browser storage/cookies/URL/log, не змішує API і demo data, не показує вигадані фінанси після API failure і не обходить server-side permission/scope checks.

Перевірки: `node --test tests/developer-panel-client.test.js` та `npm run test:panel-browser` (Edge/Chrome через `PANEL_BROWSER_EXECUTABLE`, якщо browser не знайдено автоматично).
