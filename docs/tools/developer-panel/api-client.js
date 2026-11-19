const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const WEEK_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class ApiClientError extends Error {
  constructor(kind, message, { status, code, retryAfter } = {}) {
    super(message);
    this.name = "ApiClientError";
    this.kind = kind;
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

function assertObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiClientError("contract", `${name} has an invalid shape`);
  }
  return value;
}

function assertArray(value, name) {
  if (!Array.isArray(value)) {
    throw new ApiClientError("contract", `${name} must be an array`);
  }
  return value;
}

function assertNumber(value, name) {
  if (!Number.isSafeInteger(value)) {
    throw new ApiClientError("contract", `${name} must be an integer`);
  }
  return value;
}

function query(params) {
  return new URLSearchParams(
    Object.entries(params).map(([key, value]) => [key, String(value)]),
  ).toString();
}

export class DeveloperPanelApiClient {
  #baseUrl;
  #token = "";
  #fetch;
  #timeoutMs;
  #onRequest;

  constructor({
    baseUrl,
    token,
    fetchImpl = globalThis.fetch,
    timeoutMs = 15_000,
    onRequest = () => {},
  }) {
    const parsed = new URL(baseUrl);
    if (!/^https?:$/.test(parsed.protocol)) {
      throw new TypeError("API base URL must use http or https");
    }
    if (typeof fetchImpl !== "function") {
      throw new TypeError("fetch implementation is required");
    }
    this.#baseUrl = parsed.href.replace(/\/$/, "");
    this.#fetch = (input, init) => fetchImpl(input, init);
    this.#timeoutMs = timeoutMs;
    this.#onRequest = onRequest;
    this.setToken(token);
  }

  setToken(token) {
    this.#token = String(token ?? "").trim();
  }

  clearToken() {
    this.#token = "";
  }

  async get(path, { optional404 = false, rawEnvelope = false } = {}) {
    if (!this.#token) {
      throw new ApiClientError("unauthorized", "JWT is required", {
        status: 401,
      });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    const url = `${this.#baseUrl}${path}`;
    this.#onRequest({ method: "GET", path });
    let response;
    try {
      response = await this.#fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.#token}`,
        },
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new ApiClientError("timeout", "API request timed out");
      }
      throw new ApiClientError(
        "offline",
        "API is unreachable or the browser is offline",
      );
    } finally {
      clearTimeout(timer);
    }
    if (optional404 && response.status === 404) return null;
    let body;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok) {
      const apiError = body?.error;
      const metadata = {
        status: response.status,
        code: apiError?.code,
        retryAfter: response.headers.get("retry-after") ?? undefined,
      };
      if (response.status === 401) {
        throw new ApiClientError(
          "unauthorized",
          "JWT is invalid or expired",
          metadata,
        );
      }
      if (response.status === 429) {
        throw new ApiClientError(
          "rate-limited",
          "API rate limit reached",
          metadata,
        );
      }
      throw new ApiClientError(
        "http",
        apiError?.message ?? `API returned HTTP ${response.status}`,
        metadata,
      );
    }
    const envelope = assertObject(body, path);
    return rawEnvelope ? envelope : envelope.data;
  }

  async #allPages(path, collectionName, unwrap, rawEnvelope = false) {
    const first = assertObject(
      await this.get(
        `${path}${path.includes("?") ? "&" : "?"}page=1&pageSize=100`,
        { rawEnvelope },
      ),
      path,
    );
    const firstPage = unwrap(first);
    const items = [...assertArray(firstPage.items, collectionName)];
    const totalPages = firstPage.pagination.totalPages;
    for (let page = 2; page <= totalPages; page += 1) {
      const data = assertObject(
        await this.get(
          `${path}${path.includes("?") ? "&" : "?"}page=${page}&pageSize=100`,
          { rawEnvelope },
        ),
        path,
      );
      items.push(...assertArray(unwrap(data).items, collectionName));
    }
    return items;
  }

  async loadDashboard({ selectedMonth, weekStart }) {
    if (!MONTH_PATTERN.test(selectedMonth)) {
      throw new TypeError("selectedMonth must be YYYY-MM");
    }
    if (!WEEK_PATTERN.test(weekStart)) {
      throw new TypeError("weekStart must be YYYY-MM-DD");
    }
    const month = encodeURIComponent(selectedMonth);
    const week = encodeURIComponent(weekStart);
    const [
      currentUser,
      groups,
      children,
      employees,
      invoices,
      payments,
      expenses,
      currentBalances,
      finance,
      publishedSchedule,
    ] = await Promise.all([
      this.get("/auth/me"),
      this.#allPages(
        "/groups",
        "groups",
        (envelope) => ({
          items: assertArray(envelope.data, "groups"),
          pagination: {
            totalPages: assertObject(envelope.meta, "groups.meta").totalPages,
          },
        }),
        true,
      ),
      this.#allPages("/children", "children", (data) => ({
        items: assertArray(data.children, "children"),
        pagination: assertObject(data.pagination, "children.pagination"),
      })),
      this.#allPages("/people/employees", "employees", (data) => ({
        items: assertArray(data.employees, "employees"),
        pagination: assertObject(data.pagination, "employees.pagination"),
      })),
      this.#allPages(`/invoices?month=${month}`, "invoices", (data) => ({
        items: assertArray(data.invoices, "invoices"),
        pagination: assertObject(data.pagination, "invoices.pagination"),
      })),
      this.#allPages(`/payments?month=${month}`, "payments", (data) => ({
        items: assertArray(data.payments, "payments"),
        pagination: assertObject(data.pagination, "payments.pagination"),
      })),
      this.#allPages(`/expenses?month=${month}`, "expenses", (data) => ({
        items: assertArray(data.expenses, "expenses"),
        pagination: assertObject(data.pagination, "expenses.pagination"),
      })),
      this.get("/invoices/current-balances"),
      this.get(`/reports/finance/monthly?${query({ month: selectedMonth })}`),
      this.get(`/schedules/${week}/published`, { optional404: true }),
    ]);
    const balances = assertObject(currentBalances, "currentBalances");
    const report = assertObject(finance, "finance");
    for (const field of [
      "currentOutstandingCents",
      "currentOverdueCents",
      "currentRefundDueCents",
    ]) {
      assertNumber(balances[field], `currentBalances.${field}`);
    }
    for (const field of [
      "accruedIncomeMinor",
      "receiptsNetMinor",
      "expensesMinor",
      "resultMinor",
      "cashFlowMinor",
      "currentOutstandingMinor",
      "currentOverdueMinor",
      "currentRefundDueMinor",
    ]) {
      assertNumber(report[field], `finance.${field}`);
    }
    if (report.month !== selectedMonth || !report.asOf) {
      throw new ApiClientError(
        "contract",
        "Financial report month/asOf does not match the request",
      );
    }
    return {
      mode: "api",
      selectedMonth,
      weekStart,
      loadedAt: new Date().toISOString(),
      currentUser: assertObject(currentUser, "currentUser"),
      groups,
      children,
      employees,
      invoices,
      payments,
      expenses,
      currentBalances: balances,
      finance: report,
      schedule: publishedSchedule,
    };
  }
}
