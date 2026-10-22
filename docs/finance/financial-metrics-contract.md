# Контракт фінансових показників

Статус: **Proposed / Needs approval** для TASK-010. Джерело правил — §§ 15–17 чинних вимог. Документ фіксує майбутній DTO та арифметику, але не реалізує production-звіти поверх ще не створених invoices/payments/expenses.

## Одиниці та три різні часові осі

- Усі суми з суфіксом `Minor` — цілі копійки UAH (`1 грн = 100`). Floating-point для грошей не використовуємо.
- `month` і `serviceMonth` — календарний місяць послуги/зобов’язання у форматі `YYYY-MM`.
- `occurredAt` — UTC-момент фактичного руху грошей: підтвердженого надходження або повернення. Саме він визначає місяць `receiptsNetMinor`.
- `paidAt` — UTC-момент повної оплати затвердженої витрати. Саме він визначає місяць paid expenses у `cashFlowMinor`.
- `asOf` — UTC-момент, на який пораховано **поточні** залишки. Він не перетворює їх на історичний стан на кінець `month`.

Отже, річна оплата одним днем є cash receipt цього дня, але доходом послуг стають її чинні місячні частини у відповідних `serviceMonth`. Аналогічно, затверджена жовтнева витрата входить до жовтневого результату, навіть якщо її оплачено в листопаді.

## Майбутній DTO місячного звіту

```text
MonthlyFinancialReportDto {
  month: YYYY-MM
  asOf: UTC timestamp
  accruedIncomeMinor: integer
  receiptsNetMinor: integer
  expensesMinor: integer
  resultMinor: integer
  cashFlowMinor: integer
  expenseBreakdown: {
    rentMinor: integer
    salaryMinor: integer
    foodMinor: integer
    otherMinor: integer
  }
  currentOutstandingMinor: integer
  currentOverdueMinor: integer
  currentRefundDueMinor: integer
  notes: string[]
}
```

Не використовуємо поле `outstandingMinor`: воно створює хибне враження боргу на кінець вибраного місяця. Історичний баланс на довільну дату в першій версії відкладено.

## Джерела, дати та формули

| Поле | Джерело та фільтр | Часова вісь | Формула |
|---|---|---|---|
| `accruedIncomeMinor` | Чинні місячні частини invoices; для оплаченого річного invoice — його чинна частина | `serviceMonth = month` | сума чинних service parts |
| `receiptsNetMinor` | Лише `CONFIRMED` receipts/refunds | місяць `occurredAt = month` | confirmed receipts − confirmed refunds |
| `expensesMinor` | `APPROVED` expenses та дозволені коригування | `serviceMonth = month` | сума чистих затверджених витрат |
| `resultMinor` | Попередні поля | service month | `accruedIncomeMinor − expensesMinor` |
| `cashFlowMinor` | Рух грошей і повністю оплачені витрати | місяць `occurredAt` / `paidAt` | `receiptsNetMinor − paidExpensesMinor` |
| `currentOutstandingMinor` | Чинні invoices на `asOf` | поточний стан | `Σ max(0, obligationMinor − confirmedNetPaidMinor)` |
| `currentOverdueMinor` | Додатні current outstanding із `dueAt < asOf` | поточний стан | сума прострочених додатних залишків |
| `currentRefundDueMinor` | Чинні invoices після дозволених скасувань | поточний стан | `Σ max(0, confirmedNetPaidMinor − obligationMinor)` |

`PENDING` payment не входить ані до `receiptsNetMinor`, ані до `confirmedNetPaidMinor`. Прострочений, але неоплачений річний invoice не створює accrued income; він очікує явної команди переходу на місячний режим. Пізніше підтвердження може змінити звіт минулого cash-місяця, бо закриття періодів відкладене.

Aggregation доходу, платежів і витрат виконуємо окремо, а потім об’єднуємо в сценарії. Це не дозволяє множити invoice amount через join з кількома payment rows.

## Fixture: різні serviceMonth, occurredAt і paidAt

Машиночитний приклад: [`tests/fixtures/finance/monthly-report.json`](../../tests/fixtures/finance/monthly-report.json). Для звіту `2026-10`:

- чинні жовтневі частини invoices: `1 500 000 + 1 188 000 = 2 688 000` коп.;
- жовтневі confirmed receipts: `1 000 000 + 1 000 000`, confirmed refund: `300 000`, а `PENDING 500 000` ігнорується; `receiptsNetMinor = 1 700 000`;
- жовтнева approved expense `700 000` ще не оплачена й дає `expensesMinor = 700 000`;
- вереснева approved expense `200 000`, оплачена в жовтні, не входить у жовтневі expenses, але входить до жовтневого cash flow;
- `resultMinor = 2 688 000 − 700 000 = 1 988 000`;
- `cashFlowMinor = 1 700 000 − 200 000 = 1 500 000`;
- станом на `asOf` один прострочений invoice має `500 000` коп. залишку; переплати після confirmed refund немає.

## Контрольні 300 дітей

У стабільному місяці є 15 груп по 20 дітей, навчання 15 000 грн, середня персональна пільга 5%, 20% клієнтів мають річну знижку 12%. Незалежність персональної пільги та річного вибору — явне припущення цього прогнозу.

```text
середня персональна пільга = 15%×10% + 10%×20% + 5%×30% = 5%
середній дохід на дитину = 15 000 × 0,95 × (0,80 + 0,20×0,88)
                          = 13 908 грн
дохід навчання            = 300 × 13 908 = 4 172 400 грн
зарплати 15 пар           = 1 860 000 грн
інші наведені витрати     = 610 000 грн
наведені витрати разом    = 2 470 000 грн
результат                 = 4 172 400 − 2 470 000 = 1 702 400 грн
```

Це **результат навчання до податків**, не універсальний прибуток і не банківські надходження місяця. Собівартість харчування відсутня; також не включені податки, амортизація, банківські комісії та інші не наведені витрати. Їх не можна непомітно вважати нульовими: production DTO має пояснити пропуски в `notes`.

## Умови погодження

- S7 незалежно звіряє fixture, формули та контрольні 300 дітей.
- Команда підтверджує назви полів, одиниці та часові осі до реалізації aggregation.
- Після погодження TASK-030–TASK-033 використовують цей контракт без змішування accrual, cash та current balances.
