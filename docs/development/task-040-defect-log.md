# TASK-040 defect log

Оновлено 2026-11-09. Secrets/JWT/real personal data тут не зберігаються.

| ID | Severity | Стан | Доказ / наступна дія |
| --- | --- | --- | --- |
| D-040-001 | Acceptance blocker | Open | TASK-037 ще не integrated: PR #106 потребує незалежного review, green CI і merge. |
| D-040-002 | Acceptance blocker | Open | Командний browser/Swagger walkthrough і пояснення кожного учасника не проводилися; виконати за підготовленим сценарієм. |
| D-040-003 | Evidence gap | Open | Current exact SHA не пройдено колегою на чистому macOS checkout. Попередній macOS proof є у PR #103; повторити для фінального integration SHA. |
| D-040-004 | Technical debt | Open, non-blocking | Mongoose 9 виводить deprecation warning для option `new` у `findOneAndUpdate`; перейти на `returnDocument: "after"` окремою reviewed зміною. |

На локальному проході не знайдено відкритого blocker, який порушує money calculations, access scope або MongoDB transaction atomicity: відповідні unit/HTTP/replica-set tests green. Це твердження не замінює незалежний review.
