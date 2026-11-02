import { createApp } from "./app.js";
import { resolve } from "node:path";
const port = Number(process.env.PORT || 3000);
const origin = `http://127.0.0.1:${port}`;
const { app, secret } = await createApp({
  origin,
  demo: process.argv.includes("--demo"),
  secret: process.env.ADMIN_SECRET,
  production:
    process.env.NODE_ENV === "production" ||
    process.argv.includes("--production"),
});
if (
  process.env.NODE_ENV === "production" ||
  process.argv.includes("--production")
) {
  const { readFile } = await import("node:fs/promises");
  const root = resolve("dist/web");
  app.get("/assets/:file", async (req, reply) => {
    const { file } = req.params as { file: string };
    if (!/^[A-Za-z0-9_-]+\.(js|css|woff2|woff)$/.test(file))
      return reply.code(404).send({ error: "Asset not found" });
    try {
      return reply
        .type(
          file.endsWith(".css")
            ? "text/css"
            : file.endsWith(".woff2")
              ? "font/woff2"
              : file.endsWith(".woff")
                ? "font/woff"
                : "application/javascript",
        )
        .send(await readFile(resolve(root, "assets", file)));
    } catch {
      return reply.code(404).send({ error: "Asset not found" });
    }
  });
  app.get("/", async (_req, reply) =>
    reply.type("text/html").send(await readFile(resolve(root, "index.html"))),
  );
  app.get("/overlay", async (_req, reply) =>
    reply.type("text/html").send(await readFile(resolve(root, "index.html"))),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: "spa",
  });
  app.setNotFoundHandler((req, reply) => {
    reply.hijack();
    vite.middlewares(req.raw, reply.raw, () => {
      reply.raw.statusCode = 404;
      reply.raw.end();
    });
  });
  app.addHook("onClose", async () => vite.close());
}
await app.listen({ host: "127.0.0.1", port });
console.log(
  `Reality Glitch listening on ${origin}\nOperator key (private; enter in dashboard): ${secret}\nOBS path: /overlay`,
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
