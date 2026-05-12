const { rest, sendJson, parseBody } = require("../../_lib/supabase");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method Not Allowed" });
    const id = req.query.id;
    const body = parseBody(req);
    if (!body.body) return sendJson(res, 400, { error: "comment body is required" });

    const rows = await rest(`incidents?select=id,comments&id=eq.${encodeURIComponent(id)}&limit=1`);
    const current = rows[0];
    if (!current) return sendJson(res, 404, { error: "Not Found" });

    const comments = current.comments || [];
    comments.push({
      authorId: body.authorId,
      body: body.body,
      createdAt: new Date().toISOString()
    });

    await rest(`incidents?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify([{ comments }])
    });

    return sendJson(res, 201, { ok: true });
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
};
