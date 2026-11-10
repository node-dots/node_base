import { ApiClientError, DeveloperPanelApiClient } from "./api-client.js";
import { createDemoDashboard } from "./demo-data.js";

const ids = [
  "base-url",
  "jwt",
  "month",
  "week",
  "api-button",
  "demo-button",
  "refresh-button",
  "disconnect-button",
  "mode-badge",
  "status",
  "stale",
  "dashboard",
  "summary",
  "finance",
  "finance-as-of",
  "finance-notes",
  "groups",
  "children",
  "employees",
  "invoices",
  "payments",
  "expenses",
  "schedule",
  "request-log",
];
const elements = Object.fromEntries(
  ids.map((id) => [id, document.getElementById(id)]),
);
let client = null;
let mode = "demo";
let data = null;
let staleTimer = null;
const requestLog = [];

function monday(date = new Date()) {
  const copy = new Date(date);
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  return copy.toISOString().slice(0, 10);
}
elements.month.value = new Date().toISOString().slice(0, 7);
elements.week.value = monday();

function setStatus(kind, message) {
  elements.status.className = `status ${kind}`;
  elements.status.textContent = message;
}
function setBusy(busy) {
  elements.dashboard.setAttribute("aria-busy", String(busy));
  elements["api-button"].disabled = busy;
  elements["demo-button"].disabled = busy;
  elements["refresh-button"].disabled = busy || !data;
}
function escapeHtml(value) {
  return String(value ?? "—")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
function money(minor) {
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
  }).format(Number(minor ?? 0) / 100);
}
function table(target, rows, columns) {
  if (!rows.length) {
    target.innerHTML =
      '<p class="empty">Немає даних для вибраного періоду.</p>';
    return;
  }
  target.innerHTML = `<table><thead><tr>${columns.map(([label]) => `<th>${escapeHtml(label)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map(([, value]) => `<td>${escapeHtml(value(row))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}
function metrics(target, values) {
  target.innerHTML = values
    .map(
      ([label, value]) =>
        `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`,
    )
    .join("");
}

function render(next) {
  data = next;
  mode = next.mode;
  elements["mode-badge"].textContent = mode.toUpperCase();
  elements["mode-badge"].className = `badge ${mode}`;
  elements.dashboard.classList.remove("hidden");
  elements["disconnect-button"].disabled = false;
  elements["refresh-button"].disabled = false;
  metrics(elements.summary, [
    ["Групи", next.groups.length],
    ["Діти", next.children.length],
    ["Працівники", next.employees.length],
    ["Рахунки", next.invoices.length],
    ["Платежі", next.payments.length],
    ["Витрати", next.expenses.length],
  ]);
  const finance = next.finance;
  metrics(elements.finance, [
    ["Нараховано", money(finance.accruedIncomeMinor)],
    ["Надходження нетто", money(finance.receiptsNetMinor)],
    ["Витрати", money(finance.expensesMinor)],
    ["Результат", money(finance.resultMinor)],
    ["Cash flow", money(finance.cashFlowMinor)],
    ["Поточний борг", money(finance.currentOutstandingMinor)],
    ["Прострочено", money(finance.currentOverdueMinor)],
    ["До повернення", money(finance.currentRefundDueMinor)],
  ]);
  elements["finance-as-of"].textContent =
    `${finance.month} · asOf ${new Date(finance.asOf).toLocaleString("uk-UA")}`;
  elements["finance-notes"].innerHTML = (finance.notes ?? [])
    .map((note) => `<span class="note">${escapeHtml(note)}</span>`)
    .join("");
  table(elements.groups, next.groups, [
    ["Назва", (r) => r.name],
    ["Статус", (r) => r.status],
    [
      "Місця",
      (r) => `${r.currentOccupied ?? r.occupiedSeats ?? 0}/${r.capacity}`,
    ],
    ["Вільно", (r) => r.freePlaces],
  ]);
  table(elements.children, next.children, [
    ["Дитина", (r) => `${r.lastName} ${r.firstName}`],
    ["Статус", (r) => r.status],
    ["Група", (r) => r.groupId],
  ]);
  table(elements.employees, next.employees, [
    ["Працівник", (r) => `${r.lastName} ${r.firstName}`],
    ["Посада", (r) => r.employee?.positionCode],
    ["Статус", (r) => r.employee?.status],
  ]);
  table(elements.invoices, next.invoices, [
    ["Послуга", (r) => r.service],
    ["Місяць", (r) => r.serviceMonth],
    ["Статус", (r) => r.status],
    ["Залишок", (r) => money(r.remainingAmountCents)],
  ]);
  table(elements.payments, next.payments, [
    ["Статус", (r) => r.status],
    ["Метод", (r) => r.method],
    ["Сума", (r) => money(r.amountCents)],
    ["Час", (r) => r.occurredAt ?? r.reportedAt],
  ]);
  table(elements.expenses, next.expenses, [
    ["Категорія", (r) => r.category],
    ["Статус", (r) => r.status],
    ["Сума", (r) => money(r.amountCents)],
    ["Місяць", (r) => r.serviceMonth],
  ]);
  table(elements.schedule, next.schedule?.slots ?? [], [
    ["День", (r) => r.weekday],
    ["Час", (r) => `${r.startTime}–${r.endTime}`],
    ["Предмет", (r) => r.subjectCode],
    ["Група", (r) => r.groupId],
  ]);
  elements["request-log"].textContent =
    requestLog.join("\n") || "Demo mode: API-запитів немає.";
  elements.stale.classList.add("hidden");
  clearTimeout(staleTimer);
  staleTimer = setTimeout(
    () => elements.stale.classList.remove("hidden"),
    5 * 60_000,
  );
}

function describe(error) {
  if (!(error instanceof ApiClientError)) return "Невідома помилка клієнта.";
  const messages = {
    unauthorized: "401: JWT відсутній, прострочений або недійсний.",
    "rate-limited": `429: забагато запитів.${error.retryAfter ? ` Повторити через ${error.retryAfter} с.` : ""}`,
    timeout: "Timeout: API не відповів у встановлений час.",
    offline: "Offline: мережа або API недоступні.",
    contract: `Помилка контракту API: ${error.message}`,
    http: `${error.status ?? "API"}: ${error.message}`,
  };
  return messages[error.kind] ?? error.message;
}

async function loadApi() {
  if (!navigator.onLine)
    return setStatus("error", "Offline: браузер не має мережевого з’єднання.");
  setBusy(true);
  setStatus("loading", "Завантаження захищених GET endpoints…");
  try {
    const next = await client.loadDashboard({
      selectedMonth: elements.month.value,
      weekStart: elements.week.value,
    });
    render(next);
    setStatus(
      "success",
      `API дані завантажено: ${new Date(next.loadedAt).toLocaleString("uk-UA")}.`,
    );
  } catch (error) {
    data = null;
    elements.dashboard.classList.add("hidden");
    setStatus("error", describe(error));
  } finally {
    setBusy(false);
  }
}

elements["api-button"].addEventListener("click", async () => {
  const token = elements.jwt.value;
  requestLog.length = 0;
  try {
    client?.clearToken();
    client = new DeveloperPanelApiClient({
      baseUrl: elements["base-url"].value,
      token,
      onRequest: ({ method, path }) => requestLog.push(`${method} ${path}`),
    });
    elements.jwt.value = "";
    await loadApi();
  } catch (error) {
    elements.jwt.value = "";
    setStatus("error", error.message);
  }
});
elements["demo-button"].addEventListener("click", () => {
  client?.clearToken();
  client = null;
  requestLog.length = 0;
  render(
    createDemoDashboard({
      selectedMonth: elements.month.value,
      weekStart: elements.week.value,
    }),
  );
  setStatus(
    "success",
    "Demo режим: показано лише явно позначені локальні приклади.",
  );
});
elements["refresh-button"].addEventListener("click", () => {
  if (mode === "api") return loadApi();
  render(
    createDemoDashboard({
      selectedMonth: elements.month.value,
      weekStart: elements.week.value,
    }),
  );
  setStatus("success", "Demo дані оновлено.");
});
elements["disconnect-button"].addEventListener("click", () => {
  client?.clearToken();
  client = null;
  data = null;
  requestLog.length = 0;
  clearTimeout(staleTimer);
  elements.dashboard.classList.add("hidden");
  elements.stale.classList.add("hidden");
  elements["disconnect-button"].disabled = true;
  elements["refresh-button"].disabled = true;
  setStatus("idle", "Від’єднано. JWT видалено з оперативної пам’яті.");
});
window.addEventListener("offline", () =>
  setStatus("error", "Offline: мережеве з’єднання втрачено."),
);
