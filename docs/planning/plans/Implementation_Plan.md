# Implementation plan and current status

Updated 2026-11-05. This plan records implementation and verification evidence from the current repository and GitHub pull requests. A task is not described as merged unless its code is on the integration branch.

## Project tasks and pull requests

| Tasks | Pull requests | Current status |
| --- | --- | --- |
| TASK-011–012 | #73–74 | Merged. |
| TASK-013–019 | #96–102 | Open stacked PRs; GitHub Code checks and MongoDB integration checks passed; independent review is pending. |
| TASK-020–035 | #75–90 | Open stacked PRs; GitHub Code checks and MongoDB integration checks passed; independent review is pending. |
| TASK-036–038 | #91–93 | Open stacked PRs; GitHub Code checks and MongoDB integration checks passed; independent review is pending. TASK-032 and TASK-033 report modules are integrated into the downstream stack. |
| TASK-039 | #94 | Safe allowlisted insert-only seed for groups/catalog is verified. The full demo dataset required by the issue is not yet implemented. |
| TASK-040 | #95 | Integrated Linux/Windows checks are green. Fresh macOS checkout, MongoDB integration, service readiness, Swagger, and bootstrap login passed in CI via #103. Full live business-flow/browser and team walkthrough are not recorded. |

PRs #75–95 form a dependency chain; PRs #96–102 are a separate prerequisite chain. CI runs for stacked PRs. Do not merge around repository review requirements.

## Latest integrated verification

On the Windows checkout with Node.js 24.22.1 and Docker MongoDB 8.0:

- `npm.cmd run check` passed: Prettier, syntax check for 224 JavaScript files, and 170 unit/HTTP tests passed. The 26 MongoDB tests are intentionally skipped by this command.
- `npm.cmd run test:mongodb` passed: 25 passed, 0 failed, 0 skipped.
- GitHub CI Code checks and MongoDB integration checks passed on open PRs #75–102 at the latest check.
- The allowlisted `kindergarten_seed_test` was seeded twice: first run inserted 8 groups and 46 catalog records; second inserted none; a synthetic manual edit survived.

## Remaining acceptance evidence

TASK-039 requires own/foreign users, empty/full groups, annual/monthly billing, refund, expenses, and a published schedule in a repeatable demo seed. The current seed only creates groups and catalog entries. This issue is not fully implemented.

TASK-040 asks for clean Windows and macOS checkouts and a live end-to-end walkthrough, plus a team session where participants explain their implementations. Windows checks passed locally. A fresh macOS-15 GitHub-hosted runner passed `npm ci`, `npm run check`, `npm run test:mongodb`, server readiness, OpenAPI, and bootstrap-admin login smoke checks in PR #103. A full live business-flow/browser demonstration and team session are not recorded. Independent review is also required before PRs can be accepted.

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

The seed permits only `kindergarten_dev` and `kindergarten_seed_test`; verify the configured MongoDB target before running it. Do not put credentials or real personal data in the repository or demo fixtures.
