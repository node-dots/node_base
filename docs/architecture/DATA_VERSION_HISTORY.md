# Повна історія версій бізнес-даних

## Мета і межі гарантії

Застосунок зберігає незмінну послідовність станів кожного бізнес-документа в MongoDB. Механізм гарантовано охоплює записи, які проходять через Mongoose-моделі цього Node.js застосунку, включно з API, сервісами, штатними seed-скриптами та міграцією груп.

Прямий запис стороннього процесу через `mongosh`, MongoDB driver або `Model.collection` не проходить Mongoose middleware. Такий запис не можна чесно вважати покритим поточною синхронною гарантією. Варіант інфраструктурного контролю описано в розділі «Зовнішні записи».

## Рішення

Для кожної зміни створюється запис у append-only колекції `entity_versions`. Використовується гібридна схема:

- `before` і `after` містять повні очищені snapshots, тому стан можна відновити без програвання всього ланцюжка diff;
- `changedFields` містить детермінований перелік змінених шляхів для швидкого перегляду та порівняння;
- `entity_version_counters` атомарно призначає наступний номер версії для пари `entityType + entityId`.

Full snapshots обрано через простоту й надійність відновлення навчальної системи. Компроміс — більший обсяг зберігання. Один snapshot обмежено 2 MiB, кількість шляхів змін — 4096. Політика за замовчуванням: зберігати версії безстроково; перед production-експлуатацією власник даних має визначити строк зберігання, архівування та видалення відповідно до правових вимог. TTL навмисно не встановлено, бо він порушив би вимогу повної історії.

## Структура `entity_versions`

```javascript
{
  entityType: "GROUP",
  entityId: "...",
  version: 2,
  action: "UPDATE", // CREATE | UPDATE | DELETE
  changedAt: ISODate("..."),
  actorId: "...",                  // null, якщо невідомий
  requestId: "...",
  correlationId: "...",           // null, якщо не передано
  source: "API",                   // API | SERVICE | SEED | MIGRATION | OTHER
  reason: "PATCH /api/v1/...",     // null, якщо недоступна
  before: { /* повний попередній стан */ },
  after: { /* повний новий стан */ },
  changedFields: ["capacity"]
}
```

Унікальний індекс `{ entityType, entityId, version }` не дозволяє дублювати номер. Додаткові індекси підтримують пошук за типом/часом і `requestId`. Mongoose-модель `EntityVersion` забороняє update, replace і delete; API має тільки `GET` маршрути.

## Audit і version history

`audit_logs` відповідає на питання «хто виконав значущу бізнес-операцію» і зберігає лише дозволені поля конкретної події. Він зручний для контролю дій, але не відтворює кожний стан документа.

`entity_versions` відповідає на питання «яким був документ до і після кожного запису». History не замінює audit: одна бізнес-транзакція може створити кілька версій різних сутностей і один або кілька audit-записів.

## Покриття

Організаційні owners/reviewers S1–S8 і захисні Postman-кроки наведені в
[`DATA_HISTORY_TEAM_RESPONSIBILITIES.md`](../team/DATA_HISTORY_TEAM_RESPONSIBILITIES.md).
Механізм спільний: жодна команда не створює власну history collection або plugin.

Mongoose plugin підключено до постійних бізнес-колекцій:

| `entityType` | Колекція | Вкладені бізнес-дані |
| --- | --- | --- |
| `GROUP` | `groups` | ресурси, місткість, статус |
| `CHILD` | `children` | guardians, membership, benefits, статус |
| `PERSON` | `people` | account, employee profile, roles, availability, salary |
| `CATALOG` | `catalog` | financial rules, tariffs, benefits, rooms, programs |
| `INVOICE` | `invoices` | суми, balance, статус |
| `PAYMENT` | `payments` | суми, idempotency, статус |
| `REFUND` | `refunds` | суми, причина, статус |
| `EXPENSE` | `expenses` | payroll/expense data, суми, статус |
| `SCHEDULE` | `schedules` | slots, масиви призначень, статус |

Покриті `save/create`, `findOneAndUpdate/findOneAndReplace`, `updateOne/updateMany` (включно з upsert), `findOneAndDelete/deleteOne/deleteMany` та `insertMany`. Штатний catalog seed більше не використовує `bulkWrite`: він виконує ідемпотентні `updateOne` в одній транзакції, щоб кожен створений документ отримав власну версію. Прямий `bulkWrite` у бізнес-коді заборонено архітектурним правилом, бо Mongoose не надає надійного document middleware для кожного його елемента.

Зміни вкладених об'єктів, масивів, статусів та `$inc` фіксуються через порівняння повного стану до/після. Soft-delete є звичайною зміною статусу. Фізичний delete зберігає останній стан у `before`, а `after` дорівнює `null`.

## Транзакції та порядок версій

Plugin успадковує MongoDB session від бізнес-запису. Лічильник, snapshot і бізнес-документ записуються в тій самій transaction:

- rollback скасовує і дані, і версію, і збільшення лічильника;
- `withTransaction` retry скасовує невдалу спробу, тому дубліката немає;
- конкурентні транзакції серіалізуються MongoDB-конфліктами запису до лічильника й отримують суцільні номери;
- існуючий `UnitOfWork` та `AuditWriter` працюють у тій самій session і не були замінені.

API request context передає `requestId`, `correlationId`, actor і причину. Внутрішні виклики без HTTP отримують `SERVICE`; seed та migration явно встановлюють відповідне джерело.

## Безпека

Перед записом snapshot рекурсивно очищається. Passwords, hashes, JWT/token, credentials, cookies, authorization headers, API/private keys, card/CVV та binary values не зберігаються відкрито; значення замінюється на `[REDACTED]`. Це навмисний виняток із буквального «все без винятку»: секрет не є відновлюваною бізнес-версією.

Історія все одно містить персональні та фінансові дані. Доступ надано лише автентифікованому `ADMIN` з permission `history:read`. Батьки, працівники та менеджери не отримують історію чужих або власних сутностей через цей API. Mutation endpoint не існує.

## Read-only API

- `GET /api/v1/history?entityType=GROUP&entityId=...&version=2&from=...&to=...&page=1&pageSize=50`
- `GET /api/v1/history/GROUP/{entityId}/versions/2`
- `GET /api/v1/history/GROUP/{entityId}/compare?fromVersion=1&toVersion=2`

Перший endpoint підтримує тип, ID, версію, часовий період і пагінацію. Другий повертає конкретні `before`/`after`. Третій повертає обидва стани та різницю шляхів. Усі маршрути описані в OpenAPI.

## Відновлення стану

Для версії з `CREATE` або `UPDATE` відновлюваний стан — `after`. Для `DELETE` останній наявний стан — `before`. Автоматичного restore endpoint немає навмисно: відновлення є новою бізнес-зміною, потребує окремої авторизації, валідації актуальних інваріантів і має створити нову версію, а не переписати історію.

Адміністратор спочатку читає потрібний snapshot, потім передає дозволені бізнес-поля через звичайний service/API update у новій транзакції. Не слід копіювати `_id`, `__v` або redacted secrets.

## Перевірка через MongoDB

```javascript
use kindergarten_dev
db.entity_versions.find(
  { entityType: "GROUP", entityId: "<groupId>" },
  { version: 1, action: 1, before: 1, after: 1, changedFields: 1 }
).sort({ version: 1 })

db.entity_version_counters.findOne({
  entityType: "GROUP",
  entityId: "<groupId>"
})
```

## Демонстрація через Postman

1. Увійти як ADMIN.
2. Створити DRAFT-групу — версія 1 (`CREATE`).
3. Змінити місткість — версія 2 (`UPDATE`), `before.capacity` містить старе значення.
4. Призначити вільні room/educator/assistant для поточного навчального року та активувати групу штатним endpoint — версія 3 (`UPDATE`).
5. Виконати `List complete group history` у папці `21. Entity Version History`.
6. Виконати `Read group version one` і `Compare group versions`.
7. Перевірити послідовність `1, 2, 3`, `changedFields`, а також що snapshots версій 1 і 2 не змінилися.

Автоматична Postman collection створює групу, двічі змінює місткість і перевіряє три послідовні версії, compare `1 → 3` та відмову для PARENT. Крок активації для усної демонстрації потребує реально вільного комплекту ресурсів; конфлікт зайнятих ресурсів не створює версію.

## Seed і migrations

- `scripts/seed.js` записує групи й каталог через Mongoose `updateOne` у transaction з `source=SEED`;
- `scripts/demo-scenario.js` задає SEED context та actor ADMIN, а бізнес-записи виконуються через наявний `UnitOfWork`;
- `scripts/bootstrap-admin.js` створює ADMIN і його першу PERSON-версію в одній transaction;
- `scripts/migrate-groups.js --apply` змінює групи в одній transaction з `source=MIGRATION`;
- `migrate-catalog-versions.js` створює лише індекси й не змінює бізнес-документи.

Ідемпотентний повтор seed не створює версію, якщо документ фактично не змінився.

## Зовнішні записи та Change Streams

MongoDB Change Streams можуть додатково виявляти зміни поза Node.js. Для повних `before` потрібні replica set, `changeStreamPreAndPostImages` на кожній бізнес-колекції, права watcher-процесу, надійне збереження resume token, моніторинг lag та політика опрацювання пропущених подій. Post-image не замінює гарантований pre-image, а oplog має обмежений горизонт.

Watcher працює асинхронно після commit, тому не може зробити зовнішній бізнес-запис і history-запис однією transaction. Можливі затримки, дублікати після resume та втрата pre-image після завершення його retention. Отже, Change Streams доцільні як detector/compensating history й сигнал про порушення політики, але не як синхронна заміна поточного механізму.

Production-рекомендація: заборонити прямі write-права людям і стороннім процесам, надати запис лише service account застосунку та окремо розгорнути Change Stream watcher після погодження інфраструктури.

## Коротка відповідь для викладача

Історія реалізована Mongoose plugin-ом і двома MongoDB-колекціями: append-only `entity_versions` з повними безпечними станами до/після та `entity_version_counters` для атомарних номерів. Бізнес-запис, audit і нова версія використовують одну session/transaction, тому rollback і retry не залишають часткової або дубльованої історії. API історії read-only та доступний лише ADMIN; секрети рекурсивно редагуються. Гарантія охоплює всі штатні Node.js, seed і migration шляхи, але не несанкціонований прямий запис у MongoDB; для нього потрібні обмеження прав і окремий Change Stream detector.
