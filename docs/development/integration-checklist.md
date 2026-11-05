# TASK-040 integration checklist

Updated 2026-11-05. Record only steps actually run; do not include credentials, JWTs, or real personal data.

| Check                                                          | Result on this Windows checkout                                                                                                                                            |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clean checkout, `npm ci`, `npm run check`                      | Not verified from a clean checkout. `npm run check` currently fails at repository-wide Prettier check: 188 files are reported, including files outside these task changes. |
| MongoDB replica set and `npm run test:mongodb`                 | Passed with Docker Desktop, MongoDB 8.0, Node.js v24.22.1: 22 passed, 0 failed, 0 skipped.                                                                                 |
| Seed twice in `kindergarten_seed_test`                         | Passed: first run inserted 8 groups and 46 catalog records; second inserted 0; a manual group-name edit survived the rerun.                                                |
| Bootstrap ADMIN, live login, readiness, and Swagger            | Automated tests exist; a complete live-browser walkthrough is still pending.                                                                                               |
| Group → child → enrollment → invoice → payment                 | Still needs a full demo dataset and end-to-end walkthrough.                                                                                                                |
| Withdrawal → refund → financial reports                        | Module tests exist; a full cross-module walkthrough remains pending.                                                                                                       |
| Schedule draft → validation → publication                      | Module tests exist; a full live workflow remains pending.                                                                                                                  |
| Separate accounts and unauthorized record scope                | Automated authorization coverage exists; two-account live walkthrough remains pending.                                                                                     |
| Developer panel: API errors, 401, 429, offline, foreign origin | CORS tests exist; browser walkthrough against the complete report API remains pending.                                                                                     |
| Clean macOS checkout and startup                               | Not run in this environment.                                                                                                                                               |
| Independent peer review and team demonstration                 | Pending.                                                                                                                                                                   |

`npm test` is a separate unit/HTTP run and intentionally skips MongoDB tests. It is not evidence for the MongoDB row above. The full project is not accepted until the remaining walkthroughs, peer review, and repository checks are complete.
