let appPromise;

async function getApp() {
  if (!appPromise) {
    appPromise = import("../et-super-agent/backend/dist/app.js")
      .then((mod) => mod.createApp());
  }
  return appPromise;
}

module.exports = async function handler(req, res) {
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

  try {
    const app = await getApp();
    return app(req, res);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("API bootstrap failed:", error);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "API bootstrap failed", detail }));
  }
};
