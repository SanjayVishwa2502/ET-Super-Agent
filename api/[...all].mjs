import { createApp } from "../et-super-agent/backend/dist/app.js";

const app = createApp();

export default function handler(req, res) {
  if (typeof req.url === "string" && !req.url.startsWith("/api/")) {
    req.url = `/api${req.url.startsWith("/") ? req.url : `/${req.url}`}`;
  }

  return app(req, res);
}
