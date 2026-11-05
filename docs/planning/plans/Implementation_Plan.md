# Implementation plan and current status

Updated 2026-11-05. This plan records implementation and verification evidence from the current repository and GitHub pull requests. A task is not described as merged unless its code is on the integration branch.

## Project tasks and pull requests

| Tasks | Pull requests | Current status |
| --- | --- | --- |
| TASK-011–012 | #73–74 | Merged. |
| TASK-013–019 | #96–102 | Open stacked PRs; GitHub Code checks and MongoDB integration checks passed; independent review is pending. |
| TASK-020–035 | #75–90 | Open stacked PRs; GitHub Code checks and MongoDB integration checks passed; independent review is pending. |
| TASK-036–038 | #91–93 | Open stacked PRs; GitHub Code checks and MongoDB integration checks passed; independent review is pending. TASK-032 and TASK-033 report modules are integrated into the downstream stack. |
| TASK-039 | #94, #105 | Complete demo dataset implemented and locally verified in #105. GitHub CI passed; independent review and normal merge chain remain. |
| TASK-040 | #95 | Integrated Linux/Windows checks are green. Fresh macOS checkout, MongoDB integration, service readiness, Swagger, and bootstrap login passed in CI via #103. Full live business-flow/browser and team walkthrough are not recorded. |

PRs #75–95 form a dependency chain; PRs #96–102 are a separate prerequisite chain. CI runs for stacked PRs. Do not merge around repository review requirements.

## Latest integrated verification

On the Windows checkout with Node.js 24.22.1 and Docker MongoDB 8.0:

- `npm.cmd run check` passed: Prettier, syntax check for 229 JavaScript files, and 172 unit/HTTP tests passed. The 27 MongoDB-only tests are intentionally skipped by this command.
- `npm.cmd run test:mongodb` passed: 26 passed, 0 failed, 0 skipped, including the full repeatable TASK-039 seed scenario.
- GitHub Code checks and MongoDB integration passed on PRs #75–#105 at the latest observed checks; PR #105 is the complete TASK-039 dataset.
- The full synthetic TASK-039 scenario was seeded twice in the dedicated Docker replica-set database; stable IDs/statuses remained unchanged, and manual group/person edits plus a cancelled expense were preserved.

## Remaining acceptance evidence

TASK-039 full-seed acceptance criteria are implemented in PR #105: own/foreign parent accounts, empty/full/partially occupied groups, monthly/annual billing, payment/refund, expenses, and published schedule. Local unit and MongoDB integration suites pass; PR #105 awaits independent review and the normal merge sequence.

TASK-040 Windows checks passed locally. A fresh macOS-15 GitHub-hosted runner passed setup, unit and MongoDB integration checks, service readiness, OpenAPI, and bootstrap-admin smoke checks in PR #103. The seed and Swagger instructions now support the complete scenario; a recorded live browser walkthrough and team session are not yet evidenced. Independent review is required before integration PRs are accepted.

## Reproduction commands

```powershell
npm.cmd ci
npm.cmd run check
npm.cmd run infra:up
npm.cmd run test:mongodb
$env:SEED_DATABASE = 'kindergarten_seed_test'
npm.cmd run seed
npm.cmd run seed
Remove-Item Env:SEED_DATABASE
```

Manual seed runs permit `kindergarten_dev` and `kindergarten_seed_test`; automated integration tests use a unique, generated `kindergarten_test_<32 hex>` database and drop only that database. Verify the configured MongoDB target before manual runs. Do not put credentials or real personal data in the repository or demo fixtures.
