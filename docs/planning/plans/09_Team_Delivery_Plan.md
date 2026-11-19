# План командної розробки для S1–S8

Цей документ є навігаційним представленням чинного
[`10_Jira_Backlog.md`](../tasks/10_Jira_Backlog.md), а не окремим джерелом бізнес-правил.
Назви ролей, owners, reviewers і залежності беруться з backlog. Реальні GitHub handles
має погодити тімлід у TASK-001; тут вони не вигадуються.

## Розподіл відповідальності

| Роль | Основний delivery stream | Власні TASK |
| --- | --- | --- |
| S1 | Git/CI, readiness, UnitOfWork/audit, фінальна інтеграція | 002, 003, 011, 040 |
| S2 | people, auth/accounts, roles/access, employees | 006, 012, 013, 014, 038 |
| S3 | children, guardians, membership, withdrawal | 008, 016, 017, 026 |
| S4 | groups/resources/capacity, operational reports | 009, 015, 030, 033 |
| S5 | catalog, financial rules/programs, repeatable demo seed | 007, 018, 039 |
| S6 | Clock, schedule validation/draft/publish/generator | 005, 022, 023, 024, 034 |
| S7 | exact money, invoices, payments, refunds | 004, 019, 020, 021, 025, 027 |
| S8 | financial contract, expenses/payroll, reports/forecast/panel | 010, 028, 029, 031, 032, 035, 036, 037 |

Історія даних не є дев'ятим stream і не належить лише S6. Кожна роль відповідає за
tracked writes своїх модулів через єдиний `entity_versions` mechanism. Детальна матриця:
[`DATA_HISTORY_TEAM_RESPONSIBILITIES.md`](../../team/DATA_HISTORY_TEAM_RESPONSIBILITIES.md).

## Delivery-порядок

1. TASK-001 погоджує спільні контракти, owners/reviewers, Git handles і history ownership.
2. Foundation: TASK-002–011 — CI, health, money/time, people/catalog/children/groups, audit.
3. Protected business flows: TASK-012–029 — auth, resources, enrollment, billing, schedules,
   withdrawal/refunds, expenses/payroll.
4. Aggregation і planning: TASK-030–036.
5. Integration/defense: TASK-037–040.

Кожна зміна проходить feature branch → PR → required CI → незалежний review → merge у
`develop`. `main` оновлюється лише окремим release PR після acceptance gates.

## Спільний Definition of Done

- Контракт входу/виходу, permissions/scope і stable errors реалізовані та описані.
- Business write використовує repository/model і потрібну MongoDB session; прямий native
  write або `bulkWrite` для versioned моделей не допускається.
- Власник показує позитивний і негативний сценарій, а reviewer перевіряє модульну history.
- Unit/HTTP, MongoDB integration, OpenAPI/Postman і relevant browser checks зелені.
- Немає self-approval, admin bypass, force push або прямих змін `main`/`develop`.

Точні acceptance criteria, estimates, dependencies і reviewer для кожної TASK залишаються
в [`10_Jira_Backlog.md`](../tasks/10_Jira_Backlog.md); календар — у
[`13_Gantt_Plan.md`](../gantt/13_Gantt_Plan.md).
