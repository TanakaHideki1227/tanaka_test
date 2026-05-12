const { rest, sendJson } = require("../../lib/supabase");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "DELETE") return sendJson(res, 405, { error: "Method Not Allowed" });
    const id = req.query.id;

    const incidents = await rest("incidents?select=*");
    for (const inc of incidents) {
      let changed = false;
      const next = { ...inc };
      if (next.assignee_id === id) {
        next.assignee_id = null;
        changed = true;
      }
      if (next.reporter_id === id) {
        next.reporter_id = null;
        changed = true;
      }
      const allowed = next.allowed_user_ids || [];
      if (allowed.includes(id)) {
        next.allowed_user_ids = allowed.filter((uid) => uid !== id);
        changed = true;
      }
      const comments = next.comments || [];
      const filteredComments = comments.filter((c) => c.authorId !== id);
      if (filteredComments.length !== comments.length) {
        next.comments = filteredComments;
        changed = true;
      }
      if (changed) {
        await rest(`incidents?id=eq.${encodeURIComponent(next.id)}`, {
          method: "PATCH",
          body: JSON.stringify([
            {
              assignee_id: next.assignee_id,
              reporter_id: next.reporter_id,
              allowed_user_ids: next.allowed_user_ids,
              comments: next.comments
            }
          ])
        });
      }
    }

    await rest(`accounts?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
    return res.status(204).end();
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
};
