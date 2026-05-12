const { rest, sendJson, parseBody } = require("./_lib/supabase");

async function nextIncidentId() {
  const rows = await rest("incidents?select=id&order=id.desc&limit=1");
  const last = rows[0]?.id || "INC-0000";
  const num = Number(last.replace("INC-", "")) + 1;
  return `INC-${String(num).padStart(4, "0")}`;
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method Not Allowed" });
    const body = parseBody(req);
    const now = new Date().toISOString();
    const id = await nextIncidentId();

    const status = body.status || "未対応";
    const incidentRow = {
      id,
      title: body.title,
      description: body.description,
      type: body.type,
      priority: body.priority,
      status,
      is_confidential: !!body.isConfidential,
      reporter_id: body.reporterId,
      assignee_id: body.assigneeId || null,
      occurred_at: new Date(body.occurredAt).toISOString(),
      created_at: now,
      closed_at: status === "クローズ" ? now : null,
      cause: body.cause || "",
      prevention: body.prevention || "",
      allowed_user_ids: body.allowedUserIds || [],
      custom_fields: body.customFields || {},
      comments: [],
      history: []
    };

    const createdRows = await rest("incidents", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([incidentRow])
    });

    await rest("notifications", {
      method: "POST",
      body: JSON.stringify([
        {
          type: "new_incident",
          message: `新規起票: ${id} ${body.title}`,
          channel: body.isConfidential ? "#incident-secret" : "#incident-general",
          created_at: now
        }
      ])
    });

    if (body.assigneeId) {
      await rest("notifications", {
        method: "POST",
        body: JSON.stringify([
          {
            type: "assign",
            message: `担当者アサイン: ${id}`,
            channel: "in-app",
            created_at: now
          }
        ])
      });
    }

    const created = createdRows[0];
    return sendJson(res, 201, {
      id: created.id,
      title: created.title,
      description: created.description,
      type: created.type,
      priority: created.priority,
      status: created.status,
      isConfidential: created.is_confidential,
      reporterId: created.reporter_id,
      assigneeId: created.assignee_id || "",
      occurredAt: created.occurred_at,
      createdAt: created.created_at,
      closedAt: created.closed_at || "",
      cause: created.cause || "",
      prevention: created.prevention || "",
      allowedUserIds: created.allowed_user_ids || [],
      customFields: created.custom_fields || {},
      comments: created.comments || [],
      history: created.history || []
    });
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
};
