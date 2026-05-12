const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function ensureEnv() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing");
  }
}

function baseHeaders() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json"
  };
}

async function rest(path, options = {}) {
  ensureEnv();
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      ...baseHeaders(),
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    throw new Error(`Supabase REST error: ${response.status} ${await response.text()}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

function sendJson(res, status, data) {
  res.status(status).json(data);
}

function parseBody(req) {
  if (typeof req.body === "object" && req.body !== null) return req.body;
  if (!req.body) return {};
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

module.exports = {
  rest,
  sendJson,
  parseBody
};
