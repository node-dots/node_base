# Спільна відповідальність команд за історію даних

Статус: технічна матриця підготовлена; відповідність GitHub handles ролям S1–S8 має бути
підтверджена реальною командою під час TASK-001. Окрема «команда історії» розформована.
Кожен власник модуля відповідає за версійність своїх write paths, але всі використовують
один механізм `entity_versions` / `entity_version_counters` і один Mongoose plugin.

## Учасники та джерело відповідальності

Чинний backlog фіксує учасників як S1–S8, owners і reviewers. Репозиторій не містить
погодженого однозначного зіставлення всіх восьми ролей із GitHub handles. Project assignees
також неповні, тому ця матриця не вигадує імен. На TASK-001 тімлід вписує handle навпроти
кожної ролі й підтверджує його коментарем у Issue #6.

| Учасник/команда | Чинна область із backlog | Відповідальний reviewer історії |
| --- | --- | --- |
| S1 | integration, CI, UnitOfWork/audit, readiness, TASK-040 | S2 для transaction/audit; S4 для CI/readiness; S1–S8 для фінальної інтеграції |
| S2 | people, auth/account, roles/access, employees | S1 або S3; S6 для employee profile |
| S3 | children, guardians, membership, withdrawal | S2; S4 для membership; S7 для withdrawal/invoice boundary |
| S4 | groups/resources/capacity, operational aggregation | S1; S3 для occupancy; S8 для reports |
| S5 | catalog/versioned rules, repeatable seed/demo data | S6; S7 для financial catalog; S3 для demo seed |
| S6 | Clock і schedules: draft/revision/publish/generator | S5; S2/S4 для protected writes/publish |
| S7 | exact money, invoices, payments, refunds | S5/S2/S1; S8 для annual invoice contract |
| S8 | expenses/payroll, finance reports/forecast/panel | S1 або S7; S6 для configuration/schedule boundary |

Reviewer означає незалежну перевірку PR або acceptance evidence, а не нового власника
модуля. History не закріплена виключно за S6: S6 відповідає тільки за schedule writes.

## Єдиний контракт версій

- Бізнес-моделі підключають `entityHistoryPlugin` з одним `entityType`.
- Бізнес-документ, audit, counter і version виконуються з тією самою MongoDB session у
  штатних транзакційних сценаріях.
- `CREATE`, фактичний `UPDATE` і фізичний `DELETE` створюють послідовні версії; no-op не
  створює зайвого запису. Soft-delete/status transition є `UPDATE`.
- Full `before`/`after` snapshots охоплюють вкладені об'єкти, масиви, статуси й точні
  financial integer values; `changedFields` показує змінені шляхи.
- Snapshots рекурсивно редагують passwords, hashes, tokens, credentials, cookies, keys і
  card/CVV. Безпеку не послаблюють заради буквального зберігання секрету.
- `bulkWrite` для versioned моделей заборонено. Seed/migrations використовують tracked
  Mongoose operations із `SEED`/`MIGRATION` context.
- `entity_versions` append-only, History API read-only та ADMIN-only. PARENT отримує 403.

## Матриця модулів і демонстрації

| Команда | Модулі та колекції | Штатні зміни | Як і чим перевіряється історія | Негативний сценарій | Postman на захисті | Обмеження |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | `audit_logs`; shared `entity_versions`, `entity_version_counters`; integration context | audit `CREATE`; request/actor/source context; transaction/rollback/retry | `history.mongodb.test.js`, `audit.mongodb.test.js`, CI MongoDB job | rollback не лишає data/version/counter; retry не дублює; version store не update/delete; tracked model `bulkWrite` відхилено | `21. Entity Version History > Compare group versions`; показати request/source та contiguous numbers | `audit_logs` не версіонується навмисно, щоб не створити recursive history; це окремий immutable журнал |
| S2 | auth/people/employees → `people` (`PERSON`) | person/account/role/employee `CREATE/UPDATE`; token version, availability, salary/status | `people.mongodb.test.js`, `auth.mongodb.test.js`, `access-control.mongodb.test.js`, all-model history coverage | password/token не з'являється відкрито; old JWT revoked; PARENT history 403 | `List people and auth history` + `PARENT cannot read entity history` | публічного physical delete немає; secret fields відновлювати зі snapshot не можна |
| S3 | children/guardians/membership/benefits/withdrawal → `children` (`CHILD`); cross-module invoice cancellation | child `CREATE`; nested nutrition/guardian/benefit/membership/status `UPDATE`; withdrawal updates child and invoices | `children.mongodb.test.js`, `children.membership.mongodb.test.js`, `invoice-balances.mongodb.test.js`, all-model history coverage | invalid state/capacity/foreign scope не створює version; failed multi-entity transaction повністю rolls back | `List child and membership history`; E2E enroll/suspend/resume/withdraw | invoice mutations проходять тільки через S7 service/repository contract і потребують review S7 |
| S4 | groups/resources/capacity → `groups` (`GROUP`); operations reports read-only | group `CREATE`; capacity/resources/status/occupied seats `UPDATE`; plugin також підтримує tracked physical `DELETE` | `groups*.mongodb.test.js`, `operations-reports.mongodb.test.js`, deep history rollback/retry/concurrency test | occupied resources, overflow або no-op не створюють version; concurrent updates мають contiguous order | `List complete group history`, version 1 і compare 1→3 | штатного API physical delete немає; deactivation є versioned status update |
| S5 | catalog/financial rules → `catalog` (`CATALOG`); seed/demo orchestration | catalog version `CREATE`; active/name/rule `UPDATE`; idempotent seed upsert | `catalog.mongodb.test.js`, `demo-seed.mongodb.test.js`, all-model history coverage | повтор seed без фактичної зміни не створює version; invalid kind не записується | `List catalog history` після `Create dated benefit version` | demo seed викликає модульні services; S5 не стає власником їхніх business rules |
| S6 | schedules → `schedules` (`SCHEDULE`) | draft `CREATE`; slots array/revision/published snapshot `UPDATE` | `schedules.mongodb.test.js`, `schedule-publish.mongodb.test.js`, generator tests, all-model history coverage | stale revision/resource conflict не записує schedule/version; rollback атомарний | `List schedule history` після generate/update/publish | Clock і pure generator не мають MongoDB state; історія належить persisted schedule, не S6 глобально |
| S7 | invoices → `invoices` (`INVOICE`); payments → `payments` (`PAYMENT`); refunds → `refunds` (`REFUND`) | invoice `CREATE/UPDATE`; payment `CREATE` і confirm/reject `UPDATE`; refund `CREATE`; balances/parts/refunded amounts nested updates | `invoices*.mongodb.test.js`, `payments.mongodb.test.js`, `refunds.mongodb.test.js`, all-model history coverage | PENDING не змінює receipt/balance; idempotent repeat не дублює version; refund cap/rollback зберігає цілісність | `List invoice history`, `List payment history`, `List refund history` | confirmed refund є immutable create; окремого refund update/delete route немає |
| S8 | expenses/payroll → `expenses` (`EXPENSE`); reports/forecast/panel read-only | expense `CREATE`; approve/pay/cancel/correction and nested snapshot `UPDATE` | `expenses.mongodb.test.js`, `open-month.mongodb.test.js`, `finance-report.mongodb.test.js`, all-model history coverage | DRAFT/CANCELLED не входить у approved totals; failed approval/payment не створює version | `List expense history` + monthly finance report | reports, forecast, search і panel не мають власної collection; вони читають versioned source data |

## Аудит шляхів, які можуть обійти plugin

Перевірено `src/` і `scripts/`: штатний бізнес-код не використовує `Model.collection`,
MongoDB native driver або `bulkWrite`. `scripts/seed.js`, catalog seed і group migration
використовують Mongoose `updateOne` у transaction/context. Catalog index migration змінює
лише індекси. `bulkWrite` зустрічається лише в negative integration tests, які доводять
відмову.

Прямий write через `mongosh`, сторонній MongoDB driver або інший process обходить Mongoose
middleware. Поточна система чесно не гарантує синхронної версії для такого запису. Production
policy має забрати прямі write-права; Change Stream з pre/post images може бути окремим
detector/compensating history, але не атомарною заміною application transaction.

## Acceptance для кожної команди

Перед `Done` власник показує один успішний write свого модуля, відповідний History API
snapshot, одну відмову без зайвої version і називає reviewer. Reviewer звіряє entity ID,
action, `before/after`, `changedFields`, redaction, session/rollback та відсутність duplicate.
Фактичні handles, exact SHA і результат записуються в Issues #6/#62; цей документ сам по собі
не є людським approval або проведеною демонстрацією.
