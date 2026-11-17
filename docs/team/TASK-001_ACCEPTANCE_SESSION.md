# TASK-001: сесія погодження командних контрактів

Статус: **підготовлено до людського погодження, але не погоджено**. Цей документ не є
протоколом проведеної зустрічі. Детальні технічні контракти описані в
[`14_Initial_Team_Contracts.md`](14_Initial_Team_Contracts.md), а короткі критерії — у
[`15_Contract_Acceptance_Checklist.md`](15_Contract_Acceptance_Checklist.md).

## Що саме погоджується

| Область | Чинний контракт | Контрольне питання |
| --- | --- | --- |
| Ідентифікатори | MongoDB `ObjectId`; у service/DTO/API — 24-символьний hex string | Чи однаково всі модулі трактують ID і 404? |
| Гроші | `*Minor` — safe integer у копійках; точні проміжні дії без float | Чи немає гривень або float у persistence/API? |
| Відсотки | `basisPoints`, `10000 = 100%` | Чи однаково округлюються знижки? |
| Дати | `YYYY-MM-DD`, `YYYY-MM`, UTC timestamp; бізнес-зона `Europe/Kyiv` | Яка часова вісь керує кожним полем? |
| Поточний час | Ін’єктований `clock.now()`, без підміни глобальної `Date` | Як тест відтворює межу дня/місяця? |
| Вхід | strict Zod schema; невідомі поля відхиляються | Де закінчується HTTP-валідація? |
| Вихід | allowlist DTO у `{ data }`; списки мають `meta` | Які внутрішні/секретні поля гарантовано відсутні? |
| Помилки | стабільний `error.code`, safe message, `requestId`; 400/401/403/404/409/422/429 | Чим validation error відрізняється від business conflict? |
| Доступ | role permissions + record scope + field policy, fail closed | Чому одного валідного JWT недостатньо? |
| Шари | route/controller → service → repository/model → DTO; ручний DI | Хто володіє бізнес-рішенням і MongoDB query? |
| Транзакція | один `session` для business write, audit і version history | Що залишається після rollback/retry? |
| Git | feature branch → PR → CI → незалежний review → merge | Хто не може self-approve? |

## Конкретний сценарій для однакового пояснення

Два учасники незалежно пояснюють один і той самий запит:

```http
POST /api/v1/groups
Authorization: Bearer <ADMIN_TOKEN>
Content-Type: application/json

{
  "name": "Мандрівники",
  "ageCategory": 4,
  "capacity": 20
}
```

Очікуваний контракт:

1. Authentication формує actor з актуального account у MongoDB; body не задає actor/status.
2. `createGroupSchema` відкидає зайві поля і нормалізує назву.
3. Permission `groups:create` перевіряється до write.
4. `GroupService` застосовує правило `ageCategory = 2..5`, `capacity = 1..20` і сам задає `DRAFT`.
5. `UnitOfWork` передає одну MongoDB session у repository, audit і entity history.
6. Repository повертає plain object зі строковим ID; controller застосовує `toGroupDto`.
7. Відповідь — `201`, `Location: /api/v1/groups/{id}` і `{ data: GroupDto }`; `_id`, `__v` та secrets відсутні.
8. Успішний commit створює audit/version; помилка будь-якого транзакційного кроку не залишає часткового стану.

Другий прохід змінює payload на `capacity: 21` і пояснює, чому write не виконується.

## Порядок 40-хвилинної сесії

1. **0–5 хв:** тімлід зіставляє GitHub handles з S1–S8, owners і reviewers.
2. **5–15 хв:** команда проходить таблицю контрактів; спірні пункти записуються як GitHub comments.
3. **15–25 хв:** два заздалегідь неузгоджені учасники незалежно пояснюють Groups-сценарій.
4. **25–32 хв:** негативні приклади: зайве поле, чужий scope, 409/422, rollback.
5. **32–37 хв:** owners підтверджують вузькі readers/commands між people, catalog, groups і children.
6. **37–40 хв:** тімлід фіксує рішення, відкриті питання, відповідальних і строки.

## Доказ у GitHub

У [Issue #6](https://github.com/node-dots/node_base/issues/6) тімлід залишає коментар:

```text
TASK-001 acceptance проведено на SHA <sha>, дата/час <Europe/Kyiv>.
Присутні: @handle...; зіставлення S1–S8: ...
Groups-сценарій незалежно пояснили: @handle1, @handle2.
Підтверджено: ID/DTO/errors, money/basisPoints/dates/Clock, layer boundaries,
access/scope, transaction/session, owners/readers і Git review.
Відкриті питання: none | <issue links, owner, due date>.
Рішення тімліда: accepted | changes requested.
```

Лише після реального коментаря з `accepted`, відсутності blocker-питань і потрібного review
Issue #6 можна закрити як Completed та перевести TASK-001 у `Done`.
