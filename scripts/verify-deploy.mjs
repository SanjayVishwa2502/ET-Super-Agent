const target = process.argv[2] || process.env.DEPLOY_URL;

if (!target) {
  console.error("Usage: npm run verify:deploy -- <deploy-url>");
  console.error("Example: npm run verify:deploy -- https://et-super-agent-uurs.vercel.app");
  process.exit(1);
}

const base = target.replace(/\/$/, "");

async function check(url, options = {}) {
  try {
    const res = await fetch(url, options);
    const text = await res.text();
    return { ok: true, status: res.status, body: text.slice(0, 200) };
  } catch (error) {
    return { ok: false, status: 0, body: error instanceof Error ? error.message : String(error) };
  }
}

const checks = [
  { name: "home", url: base, options: { method: "GET" } },
  { name: "api-health", url: `${base}/api/health`, options: { method: "GET" } },
  {
    name: "api-login-shape",
    url: `${base}/api/profile/login`,
    options: {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "nobody@example.com", password: "invalid" }),
    },
  },
];

let hasFailure = false;
for (const item of checks) {
  const result = await check(item.url, item.options);
  console.log(`[${item.name}] ${item.url}`);
  console.log(`status=${result.status} ok=${result.ok}`);
  console.log(`body=${result.body}`);
  console.log("---");

  if (!result.ok) {
    hasFailure = true;
    continue;
  }

  if (item.name === "home" && result.status !== 200) hasFailure = true;
  if (item.name === "api-health" && result.status !== 200) hasFailure = true;
  if (item.name === "api-login-shape" && ![200, 400, 401, 404].includes(result.status)) hasFailure = true;
}

process.exit(hasFailure ? 1 : 0);
