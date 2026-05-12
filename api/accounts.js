const { rest, sendJson, parseBody } = require("../lib/supabase");

function accountIdFromCount(count) {
  return `u${count + 1}`;
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "POST") {
      const body = parseBody(req);
      if (!body.name || !body.email) return sendJson(res, 400, { error: "name and email are required" });

      const all = await rest("accounts?select=id");
      const id = accountIdFromCount(all.length);
      const now = new Date().toISOString();

      const createdRows = await rest("accounts", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify([
          {
            id,
            name: body.name,
            email: body.email,
            role: "user",
            created_at: now
          }
        ])
      });

      await rest("notifications", {
        method: "POST",
        body: JSON.stringify([
          {
            type: "account_created",
            message: `アカウント登録: ${body.name} (${body.email})`,
            channel: "mail",
            created_at: now
          }
        ])
      });

      const created = createdRows[0];
      return sendJson(res, 201, {
        id: created.id,
        name: created.name,
        email: created.email,
        role: created.role,
        createdAt: created.created_at
      });
    }
    return sendJson(res, 405, { error: "Method Not Allowed" });
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
};
