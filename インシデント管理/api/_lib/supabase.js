const RAW_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

/**
 * Supabase の Project URL は必ず https://....supabase.co（または自前ドメイン）です。
 * sb_publishable_ / sb_secret_ / JWT だけを URL に貼ると fetch が失敗します。
 */
function resolveProjectUrl() {
  const raw = RAW_URL;
  if (!raw) return "";

  if (/^sb_(publishable|secret)_/i.test(raw) || (/^eyJ/.test(raw) && !/^https?:\/\//i.test(raw))) {
    throw new Error(
      "SUPABASE_URL に「キー」が入っています。Supabase ダッシュボード → Project Settings → Data API（または API）の「Project URL」欄にある https://xxxxxxxx.supabase.co というURLだけをコピーしてください。sb_publishable_ で始まる値はURLではありません。"
    );
  }

  const normalized = raw.replace(/\/+$/, "");
  try {
    const u = new URL(normalized);
    if (u.protocol !== "https:") {
      throw new Error("SUPABASE_URL は https:// で始まる必要があります。");
    }
    return normalized;
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error(
        `SUPABASE_URL がURLとして解釈できません（先頭: ${raw.slice(0, 24)}…）。Project URL（https://xxxxx.supabase.co）を設定し、再デプロイしてください。`
      );
    }
    throw e;
  }
}

function ensureEnv() {
  const projectUrl = resolveProjectUrl();
  if (!projectUrl || !SUPABASE_SERVICE_ROLE_KEY) {
    const missing = [];
    if (!projectUrl) missing.push("SUPABASE_URL（または NEXT_PUBLIC_SUPABASE_URL）");
    if (!SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
    throw new Error(
      `Vercel の Environment Variables に次を設定してください: ${missing.join("、")}。Supabase の Project Settings → Data API の Project URL と、API Keys の service_role をコピーし、保存後に再デプロイしてください。`
    );
  }
  if (/^sb_publishable_/i.test(SUPABASE_SERVICE_ROLE_KEY)) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY に publishable キーが入っています。service_role（長い secret / JWT）を設定してください。Project Settings → API Keys で「service_role」を表示してコピーします。"
    );
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
  const projectUrl = resolveProjectUrl();
  let response;
  try {
    response = await fetch(`${projectUrl}/rest/v1/${path}`, {
      ...options,
      headers: {
        ...baseHeaders(),
        ...(options.headers || {})
      }
    });
  } catch (err) {
    const combined = `${err && err.message ? err.message : ""} ${RAW_URL}`;
    if (/Failed to parse URL|Invalid URL|sb_publishable|sb_secret_/i.test(combined)) {
      throw new Error(
        "SUPABASE_URL が正しい Project URL（https://xxxx.supabase.co）になっていません。Vercel の環境変数 SUPABASE_URL を修正し、再デプロイしてください。sb_publishable_ で始まる値はキーなので URL 欄には入れません。"
      );
    }
    throw err;
  }
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
