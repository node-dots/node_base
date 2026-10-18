import { createServer } from "node:http";

// Тайм-аути транспорту; вони не замінюють обмеження часу бізнес-операцій.
export function createHttpServer({ app, securityConfig }) {
  const server = createServer(
    {
      headersTimeout: securityConfig.HEADERS_TIMEOUT_MS,
      requestTimeout: securityConfig.REQUEST_TIMEOUT_MS,
      keepAliveTimeout: securityConfig.KEEP_ALIVE_TIMEOUT_MS,
    },
    app,
  );

  server.setTimeout(securityConfig.SOCKET_IDLE_TIMEOUT_MS, (socket) => {
    socket.destroy(); // Закриваємо з’єднання, яке не передає дані.
  });

  return server;
}
