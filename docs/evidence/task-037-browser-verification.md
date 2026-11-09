# TASK-037 browser verification

- Date: 2026-11-09 (Europe/Kyiv)
- Browser: locally installed Microsoft Edge, headless, driven through `playwright-core`
- Command: `npm run test:panel-browser`
- Result: passed
- API calls observed by the harness: 40; every application call was read-only `GET`
- Screenshot: [`task-037-panel-browser.png`](./task-037-panel-browser.png)

Verified scenarios:

1. Demo mode performs no API requests and is visibly labelled `DEMO`.
2. API mode uses current protected endpoints for groups, children, employees, invoices, payments, expenses, balances, monthly finance and published schedule.
3. Loading and empty states are visible.
4. Successful finance rendering uses `selectedMonth`, `asOf`, `currentOutstandingMinor`, `currentOverdueMinor` and `currentRefundDueMinor`.
5. The JWT input is cleared after connect; localStorage, sessionStorage and cookies remain empty; the request log contains paths only.
6. Stale warning appears after five minutes.
7. 401, 429 with exposed `Retry-After`, timeout and browser-offline states are distinct.
8. API failure hides the prior dashboard; the client never substitutes demo financial values.

This is automated browser verification, not evidence that the team presentation or defense occurred.
