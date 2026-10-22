# Початкові командні контракти

Статус: **Proposed / Needs approval**. Документ підготовлено за чинними вимогами,
архітектурними рішеннями та фактичним кодом. Він не є протоколом проведеної
зустрічі й не вважається прийнятим, доки тімлід і команда явно не підтвердять
розділ «Потрібне погодження».

Джерела істини:

- бізнес-правила — [Consolidated Requirements](../requirements/00_Consolidated_Requirements.md);
- межі шарів і DI — [Architecture Decisions](../architecture/02_Architecture_Decisions.md);
- ролі й політики — [Access Control](../architecture/03_Access_Control.md);
- Git і review — [Git Workflow](GIT_WORKFLOW.md);
- задачі та попередні ролі S1–S8 — [Jira Backlog](../planning/tasks/10_Jira_Backlog.md).

У разі суперечності цей документ не змінює вимоги: спочатку погоджується й
оновлюється джерело істини, потім залежний контракт і код.

## 1. Спільні типи та формати

| Значення | Контракт | Статус |
|---|---|---|
| ID документа | У MongoDB — `ObjectId`; у repository, service, DTO та API — непорожній рядок із 24 hex-символів | Реалізовано для groups і people |
| Грошова сума | `moneyMinor`: невід’ємний safe integer у копійках; точні проміжні дії через `BigInt`; назовні JSON number | Реалізовано у `src/utils/money.js` |
| Відсоток | `basisPoints`: ціле 0–10000; 10000 = 100% | Реалізовано |
| Дата народження | календарний рядок `YYYY-MM-DD`, без неявної часової зони | Реалізовано в calendar helper |
| Місяць послуги | `YYYY-MM` | Реалізовано |
| Навчальний рік | `YYYY-YYYY`, другий рік дорівнює першому + 1 | Реалізовано |
| Подія | UTC timestamp; JSON-вигляд — ISO 8601 | Вимога |
| Бізнес-зона | IANA `Europe/Kyiv`, без постійного `+02/+03` | Реалізовано |
| Поточний час | `clock.now()` передається залежністю; тести не підміняють глобальну `Date` | Реалізовано |

Знижки застосовуються послідовно з half-up округленням на визначених кроках.
Розподіл залишкових копійок детермінований: по одній копійці першим частинам.

## 2. DTO та помилки

Один ресурс API повертається як `{ data: resource }`; список —
`{ data: [...], meta: { ... } }`. DTO явно перелічує дозволені поля. `_id`,
`__v`, Mongoose documents, `passwordHash`, `tokenVersion` і поля, заборонені
field-policy, не виходять назовні. Зарплата не входить до загального або
менеджерського профілю працівника.

Помилка API має форму:

```json
{
  "error": {
    "code": "STABLE_MACHINE_CODE",
    "message": "Безпечне пояснення",
    "details": [],
    "requestId": "request-id"
  }
}
```

`details` необов’язкове й не містить секретів. Статуси: 400 — форма запиту;
401 — автентифікація; 403 — дозвіл; 404 — недоступний/відсутній ресурс;
409 — конфлікт або унікальність; 422 — бізнес-правило; 429 — ліміт; 500 —
неочікувана безпечна помилка.

## 3. Межі шарів

| Шар | Відповідальність | Не робить |
|---|---|---|
| schema | Zod-вхід/публічна форма, strict unknown-field policy | БД і бізнес-рішення |
| routes | шлях і порядок middleware | розрахунки |
| controller | HTTP-вхід, виклик service, статус, DTO | Mongoose-запити |
| service | бізнес-правила, доступ, послідовність | Express і прямий model access |
| repository | вузьке читання/запис/aggregation, string ID, plain objects | HTTP і рішення про права |
| model | Mongoose-структура, індекси, persistence validation | orchestration |
| dto | allowlist полів після перевірки доступу | БД і permission check |
| module | ручне складання залежностей | бізнес-логіка |

Service не імпортує model/repository instance. Залежності передаються через
constructor. Універсальний BaseRepository і DI-контейнер не вводяться.

## 4. Контракти модулів першої хвилі

### People

Одна людина — один запис `people`. `account` і `employee` необов’язкові.
`account.email` нормалізований і частково унікальний; ролей може бути кілька.
Посада, статус людини, стан працівника та `account.enabled` — різні поняття.
Зовнішній споживач читає лише DTO, а майбутня автентифікація — окремий вузький
метод account-reader.

### Catalog

Одна колекція `catalog` із контрольованими `kind`; перша хвиля:
`AGE_CATEGORY`, `ROOM`, `POSITION`, `SUBJECT`. Кожен kind має власний набір
полів, а `(kind, code)` — унікальна пара. Споживачі отримують вузькі методи на
кшталт `findActiveByKind(kind)` та `findActiveByCode(kind, code)`, а не довільний
MongoDB filter. Використані записи деактивуються; фізичне видалення не є
загальною операцією.

### Children

`guardian.personId` посилається на people і є підставою майбутньої перевірки
представництва. Інформаційний `relative` не надає доступу. Стани:
`APPLICANT`, `ACTIVE`, `SUSPENDED`, `LEFT`; критичні переходи членства не
приймаються загальним update. Межі: 4 guardians, 20 relatives, 100 membership
intervals. Харчові DTO відокремлені від загального перегляду.

### Groups

Groups володіє групою та її місткістю. Catalog володіє кімнатами/віковими
категоріями; people — працівниками; children — членством. Майбутні операції
використовують вузькі readers/commands власника даних, а транзакційний сценарій
передає одну MongoDB session.

## 5. Приклад проходження Groups-запиту

`POST /api/v1/groups` проходить так:

1. `group.routes.js` застосовує strict Zod `createGroupSchema`.
2. `GroupController.create` передає перевірений body до service.
3. `GroupService.createGroup` нормалізує назву, перевіряє вік/місткість і
   сам установлює початковий `DRAFT`.
4. `GroupRepository.insert` записує через ін’єктований `GroupModel`.
5. Mongoose перевіряє document schema і зберігає у `groups`.
6. Repository повертає plain object зі строковим `id`.
7. Controller застосовує `toGroupDto` і відповідає `201 { data: ... }`.

Клієнт не може передати власний status або довільний MongoDB filter. Та сама
service-логіка тестується без HTTP через fake repository.

## 6. Доступ до записів і полів

Роль відповідає за набір дозволів; policy — за доступні записи й поля. Права
кількох ролей об’єднуються лише для конкретної дії. Ідентифікатор із запиту не
є доказом доступу. Actor формується сервером з актуального account, а не з body.
Repository отримує вже визначену область пошуку. DTO формується лише після
перевірки service/policy. Невідома роль, permission або відсутня policy не
надає доступу.

## 7. Вузькі міжмодульні залежності

| Споживач | Власник | Мінімальний контракт |
|---|---|---|
| children | people | перевірити існування person за string ID |
| groups | catalog | прочитати активну room/age category за kind+code/ID |
| groups | people | перевірити придатність працівника до призначення |
| children enrollment | groups | атомарно зарезервувати/звільнити місце |
| auth | people | прочитати актуальні enabled, roles, tokenVersion |
| finance/scheduling | catalog | прочитати активну версію потрібного довідника |

Це назви відповідальностей, а не дозвіл створювати порожні facade-файли.
Сигнатура додається разом із першим реальним споживачем.

## 8. Git і review

- нова задача починається від актуального `develop` у власній гілці;
- feature/docs PR спрямовується в `develop`; прямі push у `develop/main`
  заборонені;
- перед merge потрібні чинний human approval, `Code checks`,
  `MongoDB integration`, відсутність конфліктів і blocking comments;
- force push і bypass ruleset не застосовуються;
- після merge перевіряється CI на `develop`; `develop → main` — окремий PR;
- тести MongoDB використовують випадкову БД і видаляють лише її;
- author не оголошує власний PR прийнятим і не підміняє reviewer.

## 9. Попередня матриця відповідальності

Позначення S1–S8 походять із backlog і **ще не зіставлені з реальними людьми**.

| Область | Власник контракту | Reviewer за backlog | Стан |
|---|---|---|---|
| bootstrap, MongoDB, transaction/audit, CI | S1 | залежить від задачі | Needs approval |
| people, account, auth, policy | S2 | S1/S3/S6 залежно від задачі | Needs approval |
| children, guardians, membership | S3 | S2/S4 | Needs approval |
| groups, resources, occupancy | S4 | S1 | Needs approval |
| catalog, seed, tariffs/programs | S5 | S6/S7 | Needs approval |
| calendar, scheduling | S6 | S2/S5 | Needs approval |
| money, invoices/payments/refunds | S7 | S5/S8 | Needs approval |
| expenses, reports, scenarios/panel | S8 | S1/S2/S7 | Needs approval |

Факт авторства commit/PR не змінює цю матрицю автоматично.

## 10. Потрібне погодження

Тімлід і команда мають явно підтвердити або скоригувати:

1. відповідність реальних учасників позначенням S1–S8;
2. доступність owner/reviewer і календарну спроможність;
3. остаточні назви/коди перших catalog records та стабільні seed ID;
4. допустимі поля manager/parent/employee/child DTO до відкриття маршрутів;
5. сигнатури міжмодульних readers у момент появи першого споживача;
6. перелік відкритих бізнес-питань, відповідального й строк рішення;
7. що два учасники незалежно пройшли наведений Groups-приклад однаково.

Поки цих доказів немає, TASK-001 лишається `In Review`, а цей документ —
`Proposed / Needs approval`. Технічні задачі можуть використовувати вже чинні
вимоги й код, не оголошуючи організаційне приймання TASK-001.
