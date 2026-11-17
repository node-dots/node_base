# TASK-040 defect log

Оновлено 2026-11-18. Secrets/JWT/real personal data тут не зберігаються.

| ID | Severity | Стан | Доказ / наступна дія |
| --- | --- | --- | --- |
| D-040-001 | Acceptance blocker | Resolved | TASK-037 integrated: PR #106 merged як `fc56298`; browser/API evidence повторно пройдено. |
| D-040-002 | Acceptance blocker | Open | Командний browser/Swagger walkthrough і пояснення кожного учасника не проводилися; виконати за підготовленим сценарієм. |
| D-040-003 | Evidence gap | Resolved | Exact `develop` SHA `c4759f2` пройшов macOS checks + MongoDB integration у GitHub Actions run `44194028615`. |
| D-040-004 | Technical debt | Resolved | Поточні repositories використовують `returnDocument: "after"`; пошук `new: true` у `src`, `scripts`, `tests` порожній. |
| D-040-005 | Release gate | Open | TASK-001, TASK-010 і TASK-040 очікують реальних людських acceptance; до цього release PR `develop` → `main` не відкривати як фінально погоджений. |

На технічному проході не знайдено відкритого blocker, який порушує money calculations,
access scope, history або MongoDB transaction atomicity: unit/HTTP/replica-set/Postman tests
green. Відкриті D-040-002/005 є людськими acceptance/release gates і не оголошуються виконаними.
