# Короткий протокол приймання початкових контрактів

Дата технічної звірки: 16 листопада 2026 року. Статус: **очікує фактичного погодження тімлідом і командою**.

## Перевірені технічні факти

- PR [#69](https://github.com/node-dots/node_base/pull/69) merged у commit `1c5df6f` після незалежного approval `ijevskiyy-yuriy`.
- Формат DTO/error envelope, string ObjectId, `moneyMinor`, `basisPoints`, `serviceMonth`, `schoolYear`, `Europe/Kyiv` і ін’єкція Clock відповідають чинному коду та тестам.
- Межі schema → route/controller → service → repository/model → DTO і ручний DI реалізовані в робочих модулях.
- Actor формується сервером; roles, record scope і field policy перевіряються окремо; невідомі ролі та permissions fail closed.
- MongoDB-команди, що змінюють кілька документів, використовують одну session/transaction; rollback і audit перевірені integration tests.
- Усі дев'ять persistent business models використовують один `entityHistoryPlugin`; відповідальність за history розподілена між S1–S8 за власними модулями, а не віддана S6.
- `npm run test:all` 18 листопада 2026 року пройшов повністю: 213 Node tests
  (184 pass, 29 Mongo-skipped), MongoDB 28/28, browser/API panel і Newman
  120 requests / 687 assertions / 0 failures.

Детальний контракт: [14_Initial_Team_Contracts.md](14_Initial_Team_Contracts.md).

## Що команда має підтвердити на зустрічі

- [ ] Тімлід зіставив реальних учасників із S1–S8 і підтвердив owners/reviewers.
- [ ] Кожна роль підтвердила свій рядок у [`DATA_HISTORY_TEAM_RESPONSIBILITIES.md`](DATA_HISTORY_TEAM_RESPONSIBILITIES.md), один позитивний write/version і один rejected/no-version сценарій.
- [ ] Команда підтвердила остаточні назви catalog records, DTO-поля й вузькі міжмодульні readers.
- [ ] Два учасники незалежно пояснили один Groups-запит через schema, service, repository і DTO однаково.
- [ ] Невирішені бізнес-питання мають відповідального та строк рішення.
- [ ] Тімлід явно погодив цей протокол або залишив перелік коригувань у GitHub.

До заповнення цих пунктів документ не є доказом проведеної зустрічі, TASK-001 не переводиться у `Done`, а Issue #6 не закривається.
