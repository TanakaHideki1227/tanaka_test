const { rest, sendJson, parseBody } = require("../_lib/supabase");

function addHistory(incident, field, next, actorId) {
  const before = incident[field] || "";
  if (before === next) return;
  incident[field] = next;
  const trackFields = ["status", "assigneeId", "priority"];
  if (trackFields.includes(field)) {
    incident.history.push({
      field,
      before,
      after: next,
      changedBy: actorId,
      changedAt: new Date().toISOString()
    });
  }
}

module.exports = async function handler(req, res) {
  try {
    const id = req.query.id;
    if (req.method === "DELETE") {
      await rest(`incidents?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
      return res.status(204).end();
    }
    if (req.method !== "PUT") return sendJson(res, 405, { error: "Method Not Allowed" });
    const body = parseBody(req);
    const rows = await rest(`incidents?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
    const current = rows[0];
    if (!current) return sendJson(res, 404, { error: "Not Found" });

    const incident = {
      status: current.status,
      assigneeId: current.assignee_id || "",
      priority: current.priority,
      history: current.history || []
    };

    addHistory(incident, "status", body.status, body.actorId);
    addHistory(incident, "assigneeId", body.assigneeId || "", body.actorId);
    addHistory(incident, "priority", body.priority, body.actorId);

    const closedAt =
      incident.status === "クローズ"
        ? current.closed_at || new Date().toISOString()
        : null;

    await rest(`incidents?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([
        {
          status: incident.status,
          assignee_id: incident.assigneeId || null,
          priority: incident.priority,
          is_confidential: !!body.isConfidential,
          allowed_user_ids: body.allowedUserIds || [],
          closed_at: closedAt,
          history: incident.history
        }
      ])
    });

    return sendJson(res, 200, { ok: true });
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
};
