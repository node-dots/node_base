# TASK-040 integration checklist

Updated 2026-11-05. Record only steps actually run; do not include credentials, JWTs, or real personal data.

## Automated verification on the Windows checkout

| Check | Result |
| --- | --- |
| `npm run check` | Passed: Prettier, syntax check (224 JavaScript files), and unit/HTTP tests (170 passed, 0 failed; 26 MongoDB cases are skipped by design in this command). |
| `npm run test:mongodb` | Passed against Docker MongoDB 8.0 replica set: 25 passed, 0 failed, 0 skipped. |
| MongoDB seed repeatability | Previously verified in isolated `kindergarten_seed_test`: first run inserted 8 groups and 46 catalog records; second inserted none; a manual group-name edit survived. |
| OpenAPI and route coverage | Documentation tests passed in `npm run check`; finance and operations report paths are registered in the integrated API. |
| Access and transaction regressions | Unit/HTTP and replica-set suites passed, including authorization scoping, atomic transactions, refunds, schedules, invoices, and reports. |

## Demonstration and portability evidence

| Check | Result |
| --- | --- |
| Full browser walkthrough of group → child → enrollment → invoice → payment → schedule → withdrawal → refund → reports | Not run as one live demonstration. Individual module and MongoDB integration coverage passed. |
| Complete demo seed containing own/foreign users, empty/full groups, monthly/annual billing, refund, expenses, and published schedule | Not implemented by the current seed. See `demo-seed-status.md`; the current seed only creates initial catalog entries and demo groups. |
| Developer panel browser walkthrough | Not run. Automated CORS and API tests passed. |
| Clean macOS checkout, startup, readiness, Swagger, bootstrap login, and MongoDB integration | Passed in GitHub Actions on `macos-15` in [PR #103](https://github.com/node-dots/node_base/pull/103): `npm ci`, `npm run check`, `npm run test:mongodb`, and live service smoke checks all passed. |
| Team demonstration and independent review | Awaiting the project team and independent reviewer. |

`npm test` intentionally skips MongoDB integration tests; those tests were run separately with `npm run test:mongodb`. The automated checks are green, but the items listed as not run or not implemented remain unverified acceptance steps and must not be described as completed.
