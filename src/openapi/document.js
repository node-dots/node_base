import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";
import packageInfo from "../../package.json" with { type: "json" };
import { registerCommonDocumentation } from "./common.js";
import { registerGroupDocumentation } from "../modules/groups/group.openapi.js";
import { registerAuthDocumentation } from "../modules/auth/auth.openapi.js";
import { registerAccountRolesDocumentation } from "../modules/people/accountRoles.openapi.js";
import { registerEmployeeDocumentation } from "../modules/people/employee.openapi.js";
import { registerChildDocumentation } from "../modules/children/child.openapi.js";
import { registerFinancialCatalogDocumentation } from "../modules/catalog/financialCatalog.openapi.js";

export function createOpenApiDocument() {
  const registry = new OpenAPIRegistry();
  registerCommonDocumentation(registry);
  // Тут додаємо документацію нових модулів, коли вони реалізовані.
  registerGroupDocumentation(registry);
  registerAuthDocumentation(registry);
  registerAccountRolesDocumentation(registry);
  registerEmployeeDocumentation(registry);
  registerChildDocumentation(registry);
  registerFinancialCatalogDocumentation(registry);

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Навчальний API дитячого садка",
      version: packageInfo.version,
      description:
        "Навчальний API модульного моноліту. Звичайний запуск використовує MongoDB; групи зберігаються після перезапуску. Login використовує короткотривалий JWT і актуальний стан облікового запису з бази. HTTP-захист, явні DTO, локальний tracing та aggregation-звіт активні. При ввімкненій телеметрії бізнес-відповіді містять X-Trace-Id. Health і документація виключені з tracing.",
    },
    servers: [{ url: "/", description: "Поточний сервер" }],
    tags: [
      { name: "Стан" },
      { name: "Групи" },
      { name: "Діти" },
      { name: "Catalog" },
      { name: "Автентифікація" },
      { name: "Облікові записи" },
      { name: "Документація" },
    ],
  });
}
