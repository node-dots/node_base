const PANEL_ORIGIN = "http://127.0.0.1:8088";
const ALLOWED_HEADERS = new Set(["authorization", "accept"]);

/** Allow the local read-only developer panel only in an explicit development configuration. */
export function createDeveloperPanelCors({ enabled = false } = {}) {
  return function developerPanelCors(request, response, next) {
    const origin = request.get("Origin");
    if (!enabled || origin !== PANEL_ORIGIN) return next();

    response.vary("Origin");
    response.set("Access-Control-Allow-Origin", PANEL_ORIGIN);
    response.set("Access-Control-Expose-Headers", "Retry-After, X-Request-Id");

    if (request.method !== "OPTIONS") return next();

    const requestedMethod = request.get("Access-Control-Request-Method");
    const requestedHeaders = (
      request.get("Access-Control-Request-Headers") ?? ""
    )
      .split(",")
      .map((header) => header.trim().toLowerCase())
      .filter(Boolean);

    if (
      requestedMethod !== "GET" ||
      requestedHeaders.some((header) => !ALLOWED_HEADERS.has(header))
    ) {
      return response.sendStatus(403);
    }

    response.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    response.set("Access-Control-Allow-Headers", "Authorization, Accept");
    response.set("Access-Control-Max-Age", "600");
    return response.sendStatus(204);
  };
}
