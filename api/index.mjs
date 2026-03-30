import { createApp } from "../et-super-agent/backend/dist/app.js";

const app = createApp();

export default function handler(req, res) {
  const pathParam = req.query?.path;
  const rewrittenPath = Array.isArray(pathParam)
    ? pathParam.join("/")
    : (typeof pathParam === "string" ? pathParam : "");

  const normalizedPath = rewrittenPath
    ? `/api/${rewrittenPath.replace(/^\/+/, "")}`
    : "/api";

  const originalUrl = typeof req.url === "string" ? req.url : "/";
  const parsed = new URL(originalUrl, "http://local");
  parsed.searchParams.delete("path");
  const remainingQuery = parsed.searchParams.toString();

  req.url = `${normalizedPath}${remainingQuery ? `?${remainingQuery}` : ""}`;
  return app(req, res);
}
