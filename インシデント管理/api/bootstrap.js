const { rest, sendJson } = require("./_lib/supabase");

module.exports = async function handler(_req, res) {
  try {
    const [settingsRows, accounts, incidents, notifications] = await Promise.all([
      rest("settings?select=slack_channel,slack_secret_channel&limit=1"),
      rest("accounts?select=id,name,email,role,created_at&order=created_at.asc"),
      rest("incidents?select=*&order=created_at.desc"),
      rest("notifications?select=*&order=created_at.desc&limit=300")
    ]);

    const settings = settingsRows[0] || {
      slack_channel: "#incident-general",
      slack_secret_channel: "#incident-secret"
    };

    sendJson(res, 200, {
      settings: {
        slackChannel: settings.slack_channel,
        slackSecretChannel: settings.slack_secret_channel
      },
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        email: a.email,
        role: a.role,
        createdAt: a.created_at
      })),
      incidents: incidents.map((i) => ({
        id: i.id,
        title: i.title,
        description: i.description,
        type: i.type,
        priority: i.priority,
        status: i.status,
        isConfidential: i.is_confidential,
        reporterId: i.reporter_id,
        assigneeId: i.assignee_id || "",
        occurredAt: i.occurred_at,
        createdAt: i.created_at,
        closedAt: i.closed_at || "",
        cause: i.cause || "",
        prevention: i.prevention || "",
        allowedUserIds: i.allowed_user_ids || [],
        customFields: i.custom_fields || {},
        comments: i.comments || [],
        history: i.history || []
      })),
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        message: n.message,
        channel: n.channel,
        createdAt: n.created_at
      }))
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
};
