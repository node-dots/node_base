import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { createOpenApiDocument } from "../openapi/document.js";

// JSON-контракт і ресурси Swagger UI обслуговуються тим самим локальним сервером.
export function makeApiDocumentationRoutes() {
  const router = Router();
  const openApiDocument = createOpenApiDocument();
  router.get("/api/v1/openapi.json", (request, response) =>
    response.json(openApiDocument),
  );
  router.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(null, {
      swaggerOptions: {
        url: "/api/v1/openapi.json",
        validatorUrl: null, // Не надсилаємо локальний контракт зовнішньому валідатору.
      },
      customSiteTitle: "API дитячого садка",
    }),
  );
  return router;
}
