# TASK-010: пакет незалежної перевірки для S7

Статус: **готовий до review, не accepted**. Авторська технічна перевірка та automated tests
не замінюють незалежну арифметичну перевірку S7. Чинні визначення полів наведено у
[`financial-metrics-contract.md`](financial-metrics-contract.md).

## Таблиця формул

| Показник | Формула | Включається | Не включається |
| --- | --- | --- | --- |
| `accruedIncomeMinor` | `Σ active invoice parts`, де `serviceMonth = month` | місячні частини зобов’язань | PENDING payment, cash date |
| `receiptsNetMinor` | `Σ confirmed receipts − Σ confirmed refunds` за місяцем `occurredAt` | фактичний підтверджений рух грошей | PENDING/REJECTED |
| `expensesMinor` | `Σ net APPROVED expenses`, де `serviceMonth = month` | витрати періоду | DRAFT/CANCELLED і дата оплати |
| `resultMinor` | `accruedIncomeMinor − expensesMinor` | accrual періоду | current debt, cash timing |
| `paidExpensesMinor` | `Σ expenses`, де місяць `paidAt = month` | реально сплачені витрати | approved, але не сплачені |
| `cashFlowMinor` | `receiptsNetMinor − paidExpensesMinor` | cash-події місяця | accrual іншого місяця |
| `currentOutstandingMinor` | `Σ max(0, obligation − confirmedNetPaid)` на `asOf` | чинний недоплачений залишок | історичний snapshot місяця |
| `currentOverdueMinor` | outstanding для `dueAt < asOf` | прострочений додатний залишок | майбутній due date |
| `currentRefundDueMinor` | `Σ max(0, confirmedNetPaid − obligation)` на `asOf` | чинна переплата після скасувань | PENDING refund/payment |

Усі значення — цілі копійки UAH. `month/serviceMonth`, `occurredAt`, `paidAt` та `asOf` —
різні часові осі й не підміняють одна одну.

## Контрольний fixture: ручний перерахунок

Для `month = 2026-10` S7 рахує без запуску production service:

| Крок | Арифметика | Очікувано, коп. |
| --- | --- | ---: |
| Accrual | `1 500 000 + 1 188 000` | `2 688 000` |
| Net receipts | `1 000 000 + 1 000 000 − 300 000`; PENDING `500 000` ігнорується | `1 700 000` |
| Approved expenses | жовтнева `700 000` | `700 000` |
| Result | `2 688 000 − 700 000` | `1 988 000` |
| Paid expenses | вереснева витрата, оплачена в жовтні | `200 000` |
| Cash flow | `1 700 000 − 200 000` | `1 500 000` |
| Current outstanding/overdue | `max(0, obligation − confirmedNetPaid)` | `500 000` |
| Refund due | переплати після confirmed refund немає | `0` |

Машиночитне джерело: [`tests/fixtures/finance/monthly-report.json`](../../tests/fixtures/finance/monthly-report.json).

## Контрольні 300 дітей

Незалежний розрахунок у гривнях:

```text
середня персональна пільга = 15%×10% + 10%×20% + 5%×30% = 5%
annual mix factor          = 80% + 20%×88% = 97,6%
середній дохід/дитину      = 15 000 × 95% × 97,6% = 13 908
дохід                      = 300 × 13 908 = 4 172 400
витрати                    = 1 860 000 + 610 000 = 2 470 000
результат                  = 4 172 400 − 2 470 000 = 1 702 400
```

Це результат навчання до податків, а не гарантований прибуток або cash receipt. Food cost,
податки, амортизація та банківські комісії не задані й мають залишатися явними у `notes`.

## Технічне відтворення для reviewer

```bash
npm ci
node --test tests/financial-contract.test.js tests/finance-report.test.js
npm run infra:up
docker compose exec -T mongodb mongosh --quiet /scripts/mongodb-init.js
npm run test:mongodb
```

Reviewer звіряє не лише green tests, а й вручну повторює обидві таблиці, перевіряє одиниці,
знаки refund та часові осі. Після роботи: `npm run infra:down`.

## Історія фінансових змін

- `INVOICE` зберігає створення, зміни parts/balance/status і cancellation після withdrawal.
- `PAYMENT` зберігає PENDING create та окремий confirm/reject update; idempotent repeat не
  створює дубльованого payment або version.
- `REFUND` створюється один раз після cap/idempotency checks; invoice/payment balances і
  refund version входять до тієї самої transaction.
- `EXPENSE` зберігає draft, approve/pay/cancel/correction та вкладений calculation snapshot.
- Financial reports нічого не записують: вони агрегують versioned source collections.

S7 додатково звіряє через History API, що PENDING не змінює invoice balance, failed/capped
refund не залишає partial versions, integer amounts не перетворюються на float, а rollback
скасовує і фінансові документи, і counters/versions. Технічна матриця:
[`DATA_HISTORY_TEAM_RESPONSIBILITIES.md`](../team/DATA_HISTORY_TEAM_RESPONSIBILITIES.md).

## Шаблон незалежного висновку

У [Issue #15](https://github.com/node-dots/node_base/issues/15) S7 або офіційно призначений
незалежний reviewer залишає:

```text
TASK-010 незалежно перевірено на SHA <sha>.
Fixture 2026-10: accrual 2 688 000; receipts net 1 700 000; expenses 700 000;
result 1 988 000; cash flow 1 500 000; outstanding/overdue 500 000; refund due 0.
300 дітей: income 4 172 400 грн; expenses 2 470 000 грн; result 1 702 400 грн.
Перевірено units/time axes/PENDING/refund signs/notes: PASS | <findings>.
History INVOICE/PAYMENT/REFUND/EXPENSE, idempotency і transaction rollback: PASS | <findings>.
Рішення: accepted | changes requested.
```

Без такого реального незалежного висновку TASK-010 залишається `In Review`.
