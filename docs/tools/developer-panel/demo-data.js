export function createDemoDashboard({ selectedMonth, weekStart }) {
  return {
    mode: "demo",
    selectedMonth,
    weekStart,
    loadedAt: new Date().toISOString(),
    currentUser: { id: "demo-admin", roles: ["ADMIN"] },
    groups: [
      {
        id: "demo-group",
        name: "Сонечко",
        status: "ACTIVE",
        capacity: 20,
        currentOccupied: 2,
        freePlaces: 18,
      },
    ],
    children: [
      {
        id: "demo-child",
        firstName: "Марія",
        lastName: "Демо",
        status: "ACTIVE",
        groupId: "demo-group",
      },
    ],
    employees: [
      {
        id: "demo-employee",
        firstName: "Олена",
        lastName: "Вихователь",
        employee: { positionCode: "EDUCATOR", status: "ACTIVE" },
      },
    ],
    invoices: [
      {
        id: "demo-invoice",
        service: "TUITION",
        serviceMonth: selectedMonth,
        status: "OPEN",
        origAmountCents: 150000,
        remainingAmountCents: 50000,
      },
    ],
    payments: [
      {
        id: "demo-payment",
        invoiceId: "demo-invoice",
        amountCents: 100000,
        method: "BANK_TRANSFER",
        status: "CONFIRMED",
      },
    ],
    expenses: [
      {
        id: "demo-expense",
        category: "RENT",
        serviceMonth: selectedMonth,
        amountCents: 60000,
        status: "APPROVED",
      },
    ],
    currentBalances: {
      currentOutstandingCents: 50000,
      currentOverdueCents: 0,
      currentRefundDueCents: 0,
      asOf: new Date().toISOString(),
      basis: "CURRENT_BALANCE_NOT_HISTORICAL",
    },
    finance: {
      month: selectedMonth,
      accruedIncomeMinor: 150000,
      receiptsNetMinor: 100000,
      expensesMinor: 60000,
      resultMinor: 90000,
      cashFlowMinor: 40000,
      currentOutstandingMinor: 50000,
      currentOverdueMinor: 0,
      currentRefundDueMinor: 0,
      expenseBreakdown: [
        { category: "RENT", amountMinor: 60000 },
        { category: "SALARY", amountMinor: 0 },
        { category: "FOOD", amountMinor: 0 },
        { category: "OTHER", amountMinor: 0 },
      ],
      asOf: new Date().toISOString(),
      notes: [
        "DEMO_DATA: values are illustrative and never mixed with API mode.",
      ],
    },
    schedule: {
      weekStart,
      revision: 1,
      publishedAt: new Date().toISOString(),
      slots: [
        {
          id: "demo-slot",
          weekday: 1,
          startTime: "09:00",
          endTime: "09:30",
          subjectCode: "MUSIC",
          groupId: "demo-group",
          teacherId: "demo-employee",
          roomId: "demo-room",
        },
      ],
    },
  };
}
