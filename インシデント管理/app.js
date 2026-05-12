const STATUSES = ["未対応", "対応中", "保留", "クローズ"];
const TYPES = ["IT障害", "セキュリティ", "業務オペレーション"];
const PRIORITIES = ["高", "中", "低"];
const typeFields = {
  IT障害: [
    ["impactSystem", "影響システム", "text"],
    ["etaRecovery", "復旧見込み時刻", "datetime-local"],
    ["tempWorkaround", "暫定対応内容", "textarea"],
    ["permanentFix", "恒久対応内容", "textarea"]
  ],
  セキュリティ: [
    ["impactScope", "影響範囲", "textarea"],
    ["leakedDataType", "漏洩情報の種別", "text"],
    ["externalReportRequired", "外部報告要否", "checkbox"],
    ["externalReportStatus", "外部報告先・状況", "textarea"]
  ],
  業務オペレーション: [
    ["affectedCustomer", "影響顧客", "text"],
    ["estimatedLoss", "推定損害額", "number"],
    ["relatedDepartment", "関連部署", "text"]
  ]
};

let state = {
  currentUserId: "",
  users: [],
  incidents: [],
  notifications: [],
  settings: { slackChannel: "#incident-general", slackSecretChannel: "#incident-secret" }
};
let listPage = 1;
const pageSize = 8;
let sortKey = "createdAt";
let sortDir = "desc";

const byId = (id) => document.getElementById(id);
const fmt = (s) => (s ? new Date(s).toLocaleString("ja-JP") : "-");

/** Vercel の Serverless は常にサイト直下の /api/*。file:// のみローカルサーバー向け。 */
function apiUrl(path) {
  if (window.location.protocol === "file:") return `http://localhost:3000${path}`;
  return path;
}
const currentUser = () => state.users.find((u) => u.id === state.currentUserId);
const canSee = (inc, user = currentUser()) =>
  !inc.isConfidential ||
  user.role === "admin" ||
  inc.reporterId === user.id ||
  inc.assigneeId === user.id ||
  (inc.allowedUserIds || []).includes(user.id);
const canEditConfidentialFlag = (inc, user = currentUser()) =>
  user.role === "admin" || inc.reporterId === user.id || inc.assigneeId === user.id;

async function api(path, options = {}) {
  const res = await fetch(apiUrl(path), {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      const j = JSON.parse(text);
      if (j && typeof j.error === "string") msg = j.error;
    } catch {
      /* そのまま */
    }
    throw new Error(msg || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  if (!text) return null;
  return JSON.parse(text);
}

async function init() {
  await loadData();
  render();
}

async function loadData() {
  const data = await api("/api/bootstrap");
  state.users = data.accounts;
  state.incidents = data.incidents;
  state.notifications = data.notifications;
  state.settings = data.settings;
  if (!state.currentUserId) state.currentUserId = state.users[0]?.id || "";
}

function render() {
  renderUserSelector();
  renderDashboard();
  renderFiltersAndTable();
  renderIncidentForm();
  renderAccountPanel();
  renderMyPage();
  renderNotifications();
  wireTabs();
}

function renderUserSelector() {
  byId("currentUser").innerHTML = state.users
    .map((u) => `<option value="${u.id}" ${u.id === state.currentUserId ? "selected" : ""}>${u.name} (${u.role})</option>`)
    .join("");
}

function renderDashboard() {
  const visible = state.incidents.filter((i) => canSee(i));
  const nonClosed = visible.filter((i) => i.status !== "クローズ");
  const kpi = (title, num) => `<div class="kpi"><h3>${title}</h3><div class="num">${num}</div></div>`;
  const byType = TYPES.map((t) => `${t}:${visible.filter((i) => i.type === t).length}`).join(" / ");
  const byPriority = PRIORITIES.map((p) => `${p}:${visible.filter((i) => i.priority === p).length}`).join(" / ");
  const hot = visible
    .filter((i) => i.priority === "高" && i.status !== "クローズ")
    .slice(0, 5)
    .map((i) => `<li>${i.id} ${i.title} (${i.status})</li>`)
    .join("");
  byId("dashboard").innerHTML = `
    <div class="panel-card">
      <div class="panel-head">
        <h2 class="panel-title">ダッシュボード</h2>
        <p class="panel-desc">閲覧権限のあるインシデントのみ集計しています。</p>
      </div>
      <div class="grid">
        ${kpi("未対応件数", visible.filter((i) => i.status === "未対応").length)}
        ${kpi("対応中件数", visible.filter((i) => i.status === "対応中").length)}
        ${kpi("保留件数", visible.filter((i) => i.status === "保留").length)}
        ${kpi("未クローズ合計", nonClosed.length)}
      </div>
    </div>
    <div class="panel-card"><h3 class="section-heading">種別内訳</h3><p class="section-body">${byType}</p></div>
    <div class="panel-card"><h3 class="section-heading">優先度内訳</h3><p class="section-body">${byPriority}</p></div>
    <div class="panel-card"><h3 class="section-heading">未対応の高優先度</h3><ul class="dash-list">${hot || "<li>なし</li>"}</ul></div>
  `;
}

function selectHtml(id, values, label, map = (v) => v) {
  return `<div class="filter-field"><label class="filter-label" for="${id}">${label}</label><select id="${id}">${values.map((v) => `<option value="${v}">${v ? map(v) : "全て"}</option>`).join("")}</select></div>`;
}
function filteredIncidents() {
  const kw = byId("fKeyword")?.value?.trim().toLowerCase() || "";
  const ft = byId("fType")?.value || "";
  const fs = byId("fStatus")?.value || "";
  const fp = byId("fPriority")?.value || "";
  const fa = byId("fAssignee")?.value || "";
  const ff = byId("fFrom")?.value || "";
  const ft2 = byId("fTo")?.value || "";
  const fc = byId("fConf")?.value || "";
  return state.incidents
    .filter((i) => canSee(i))
    .filter((i) => !ft || i.type === ft)
    .filter((i) => !fs || i.status === fs)
    .filter((i) => !fp || i.priority === fp)
    .filter((i) => !fa || i.assigneeId === fa)
    .filter((i) => !ff || i.createdAt.slice(0, 10) >= ff)
    .filter((i) => !ft2 || i.createdAt.slice(0, 10) <= ft2)
    .filter((i) => !fc || (fc === "1" ? i.isConfidential : !i.isConfidential))
    .filter((i) => !kw || [i.title, i.description, ...i.comments.map((c) => c.body)].join(" ").toLowerCase().includes(kw))
    .sort((a, b) => compareSort(a, b));
}
function compareSort(a, b) {
  const order = sortDir === "asc" ? 1 : -1;
  const pv = (i) => (i.priority === "高" ? 3 : i.priority === "中" ? 2 : 1);
  if (sortKey === "priority") return (pv(a) - pv(b)) * order;
  return String(a[sortKey]).localeCompare(String(b[sortKey])) * order;
}
function renderFiltersAndTable() {
  byId("filters-wrap").innerHTML = `
    <section class="panel-card filter-panel" aria-labelledby="filter-heading">
      <div class="panel-head">
        <h2 id="filter-heading" class="panel-title">検索・絞り込み</h2>
        <p class="panel-desc">タイトル・説明・コメントを対象にフリーワード検索できます。</p>
      </div>
      <div class="filter-grid">
        <div class="filter-field filter-field-wide">
          <label class="filter-label" for="fKeyword">フリーワード</label>
          <input id="fKeyword" type="search" placeholder="例: サーバー ログイン 顧客" autocomplete="off" />
        </div>
        ${selectHtml("fType", ["", ...TYPES], "種別")}
        ${selectHtml("fStatus", ["", ...STATUSES], "ステータス")}
        ${selectHtml("fPriority", ["", ...PRIORITIES], "優先度")}
        ${selectHtml("fAssignee", ["", ...state.users.map((u) => u.id)], "担当者", (v) => state.users.find((u) => u.id === v)?.name || "")}
        <div class="filter-field">
          <span class="filter-label">起票日（From）</span>
          <input id="fFrom" type="date" aria-label="起票日 From" />
        </div>
        <div class="filter-field">
          <span class="filter-label">起票日（To）</span>
          <input id="fTo" type="date" aria-label="起票日 To" />
        </div>
        <div class="filter-field">
          <label class="filter-label" for="fConf">機密</label>
          <select id="fConf">
            <option value="">全て</option>
            <option value="0">通常のみ</option>
            <option value="1">機密のみ</option>
          </select>
        </div>
      </div>
      <div class="filter-actions">
        <button type="button" id="applyFilterBtn" class="btn-primary">条件を適用</button>
        <button type="button" id="exportCsvBtn" class="btn-secondary">CSVエクスポート</button>
      </div>
    </section>
  `;
  byId("applyFilterBtn").onclick = () => {
    listPage = 1;
    renderIncidentTable();
  };
  byId("exportCsvBtn").onclick = exportCsv;
  renderIncidentTable();
}
function renderIncidentTable() {
  const list = filteredIncidents();
  const total = Math.max(1, Math.ceil(list.length / pageSize));
  if (listPage > total) listPage = total;
  const page = list.slice((listPage - 1) * pageSize, listPage * pageSize);
  byId("incidentTableWrap").innerHTML = `
    <div class="panel-card table-panel">
    <table>
      <thead>
        <tr>
          <th>ID</th><th>タイトル</th>
          <th><button class="secondary" data-sort="type">種別</button></th>
          <th><button class="secondary" data-sort="status">ステータス</button></th>
          <th><button class="secondary" data-sort="priority">優先度</button></th>
          <th>担当者</th>
          <th><button class="secondary" data-sort="createdAt">起票日時</button></th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${page
          .map(
            (i) => `<tr>
            <td>${i.id}</td>
            <td>${i.title}${i.isConfidential ? " 🔒" : ""}</td>
            <td>${i.type}</td>
            <td><span class="badge status-${i.status}">${i.status}</span></td>
            <td><span class="priority-${i.priority}">${i.priority}</span></td>
            <td>${state.users.find((u) => u.id === i.assigneeId)?.name || "-"}</td>
            <td>${fmt(i.createdAt)}</td>
            <td><button data-open="${i.id}">詳細</button> <button class="secondary" data-del="${i.id}">削除</button></td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
    <div class="pager">ページ ${listPage}/${total}
      <button id="prevPageBtn" ${listPage === 1 ? "disabled" : ""}>前へ</button>
      <button id="nextPageBtn" ${listPage === total ? "disabled" : ""}>次へ</button>
    </div>
    </div>
  `;
  document.querySelectorAll("[data-sort]").forEach((b) => {
    b.onclick = () => {
      const key = b.dataset.sort;
      if (sortKey === key) sortDir = sortDir === "asc" ? "desc" : "asc";
      else {
        sortKey = key;
        sortDir = "asc";
      }
      renderIncidentTable();
    };
  });
  document.querySelectorAll("[data-open]").forEach((b) => (b.onclick = () => openIncidentModal(b.dataset.open)));
  document.querySelectorAll("[data-del]").forEach((b) => {
    b.onclick = async () => {
      if (!confirm("削除しますか？")) return;
      await api(`/api/incidents/${b.dataset.del}`, { method: "DELETE" });
      await refreshAndRender();
    };
  });
  byId("prevPageBtn").onclick = () => {
    listPage -= 1;
    renderIncidentTable();
  };
  byId("nextPageBtn").onclick = () => {
    listPage += 1;
    renderIncidentTable();
  };
}

function field(key, label, type, opts = [], value = "", optionLabel = (o) => o || "未設定") {
  if (type === "select") {
    return `<label class="field"><span class="field-label">${label}</span><select id="f-${key}">${opts.map((o) => `<option value="${o}" ${o === value ? "selected" : ""}>${optionLabel(o)}</option>`).join("")}</select></label>`;
  }
  return `<label class="field"><span class="field-label">${label}</span><input id="f-${key}" type="${type}" value="${value}" /></label>`;
}
function typeField(k, l, t) {
  if (t === "textarea") return `<label class="field full"><span class="field-label">${l}</span><textarea id="cf-${k}"></textarea></label>`;
  if (t === "checkbox") return `<label class="field field-inline"><span class="field-label">${l}</span><input id="cf-${k}" type="checkbox" /></label>`;
  if (t === "number") return `<label class="field"><span class="field-label">${l}</span><input id="cf-${k}" type="number" step="any" inputmode="decimal" /></label>`;
  return `<label class="field"><span class="field-label">${l}</span><input id="cf-${k}" type="${t}"/></label>`;
}

function renderIncidentForm() {
  const form = byId("incidentForm");
  form.noValidate = true;
  form.innerHTML = `
    <div class="panel-card create-panel">
      <div class="panel-head">
        <h2 class="panel-title">新規インシデント起票</h2>
        <p class="panel-desc">必須項目（*）を入力し、種別に応じた追加項目が下に表示されます。</p>
      </div>
      <div class="form-grid">
        ${field("title", "タイトル *", "text")}
        ${field("occurredAt", "発生日時 *", "datetime-local")}
        ${field("type", "種別 *", "select", TYPES)}
        ${field("priority", "優先度 *", "select", PRIORITIES)}
        ${field("status", "ステータス *", "select", STATUSES, "未対応")}
        ${field("assigneeId", "担当者", "select", ["", ...state.users.map((u) => u.id)], "", (id) => (id ? state.users.find((u) => u.id === id)?.name || id : "未設定"))}
        <label class="field field-inline"><span class="field-label">機密フラグ</span><input id="f-isConfidential" type="checkbox" /> <span class="muted small">ON の場合は関係者のみ閲覧できます</span></label>
        <label class="field full"><span class="field-label">機密閲覧を許可するユーザー（複数選択可）</span><select id="f-allowedUserIds" multiple size="4">${state.users.map((u) => `<option value="${u.id}">${u.name} (${u.email})</option>`).join("")}</select></label>
        <label class="field full"><span class="field-label">説明 *</span><textarea id="f-description" placeholder="事象の概要・経過・影響などを記載してください。"></textarea></label>
        <div id="typeSpecific" class="type-specific field full"></div>
        <label class="field full"><span class="field-label">原因</span><textarea id="f-cause" placeholder="分かる範囲で（クローズ時の記入推奨）"></textarea></label>
        <label class="field full"><span class="field-label">再発防止策</span><textarea id="f-prevention" placeholder="対応内容・再発防止（クローズ時の記入推奨）"></textarea></label>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn-primary btn-lg">この内容で起票する</button>
      </div>
    </div>
  `;
  const typeEl = byId("f-type");
  const renderTypeFields = () => {
    byId("typeSpecific").innerHTML = `<div class="type-specific-inner"><p class="type-specific-title">${typeEl.value} の追加項目</p>${(typeFields[typeEl.value] || [])
      .map((f) => typeField(f[0], f[1], f[2]))
      .join("")}</div>`;
  };
  typeEl.onchange = renderTypeFields;
  renderTypeFields();
  form.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await createIncident();
    } catch (err) {
      console.error(err);
      alert(err && err.message ? err.message : String(err));
    }
  };
}

async function createIncident() {
  const me = currentUser();
  if (!me) {
    alert("ログインユーザーが未設定です。画面上部でユーザーを選択してください。");
    return;
  }
  const type = byId("f-type").value;
  const custom = {};
  for (const [k, _l, t] of typeFields[type] || []) {
    const el = byId(`cf-${k}`);
    if (!el) {
      throw new Error(`フォーム項目が見つかりません: ${k}。種別を一度切り替えてから再度お試しください。`);
    }
    custom[k] = t === "checkbox" ? el.checked : el.value;
  }
  const payload = {
    title: byId("f-title").value.trim(),
    description: byId("f-description").value.trim(),
    type,
    priority: byId("f-priority").value,
    status: byId("f-status").value,
    isConfidential: byId("f-isConfidential").checked,
    reporterId: me.id,
    assigneeId: byId("f-assigneeId").value || "",
    occurredAt: byId("f-occurredAt").value,
    cause: byId("f-cause").value.trim(),
    prevention: byId("f-prevention").value.trim(),
    allowedUserIds: [...byId("f-allowedUserIds").selectedOptions].map((o) => o.value),
    customFields: custom
  };
  if (!payload.title) {
    alert("タイトルを入力してください。");
    return;
  }
  if (!payload.description) {
    alert("説明を入力してください。");
    return;
  }
  if (!payload.occurredAt) {
    alert("発生日時を選択してください。");
    return;
  }
  const dt = byId("f-occurredAt");
  if (typeof dt.checkValidity === "function" && !dt.checkValidity()) {
    alert("発生日時の形式が正しくありません。日付と時刻を選び直してください。");
    return;
  }
  await api("/api/incidents", { method: "POST", body: JSON.stringify(payload) });
  await refreshAndRender();
  alert("起票しました。");
}

async function openIncidentModal(id) {
  const inc = state.incidents.find((i) => i.id === id);
  if (!inc || !canSee(inc)) return;
  const canConf = canEditConfidentialFlag(inc);
  byId("modalBody").innerHTML = `
    <h2>${inc.id} ${inc.title}</h2>
    <div class="two-col">
      <div class="card">
        <h3>基本情報</h3>
        <p>種別: ${inc.type}</p>
        <p>優先度:
          <select id="m-priority">${PRIORITIES.map((p) => `<option ${p === inc.priority ? "selected" : ""}>${p}</option>`).join("")}</select>
        </p>
        <p>ステータス:
          <select id="m-status">${STATUSES.map((s) => `<option ${s === inc.status ? "selected" : ""}>${s}</option>`).join("")}</select>
        </p>
        <p>担当者:
          <select id="m-assignee">${["", ...state.users.map((u) => u.id)].map((uid) => `<option value="${uid}" ${uid === inc.assigneeId ? "selected" : ""}>${uid ? state.users.find((u) => u.id === uid).name : "未設定"}</option>`).join("")}</select>
        </p>
        <p>機密: <input id="m-conf" type="checkbox" ${inc.isConfidential ? "checked" : ""} ${canConf ? "" : "disabled"} /></p>
        <p>機密閲覧許可:
          <select id="m-allowed" multiple ${canConf ? "" : "disabled"}>${state.users
            .map((u) => `<option value="${u.id}" ${(inc.allowedUserIds || []).includes(u.id) ? "selected" : ""}>${u.name}</option>`)
            .join("")}</select>
        </p>
        <button id="m-save">更新</button>
      </div>
      <div class="card">
        <h3>内容</h3>
        <p>${escapeHtml(inc.description)}</p>
        <h4>原因</h4><p>${escapeHtml(inc.cause || "-")}</p>
        <h4>再発防止策</h4><p>${escapeHtml(inc.prevention || "-")}</p>
      </div>
    </div>
    <div class="two-col">
      <div class="card">
        <h3>コメント</h3>
        <div>${inc.comments.map((c) => `<p><strong>${state.users.find((u) => u.id === c.authorId)?.name}</strong> ${fmt(c.createdAt)}<br/>${escapeHtml(c.body)}</p>`).join("") || "コメントなし"}</div>
        <textarea id="m-comment" placeholder="コメント追加"></textarea>
        <button id="m-comment-save">投稿</button>
      </div>
      <div class="card">
        <h3>編集履歴</h3>
        <ul>${inc.history.map((h) => `<li>${fmt(h.changedAt)} ${state.users.find((u) => u.id === h.changedBy)?.name}: ${h.field} ${h.before || "-"} → ${h.after || "-"}</li>`).join("") || "<li>履歴なし</li>"}</ul>
      </div>
    </div>
  `;
  byId("modal").classList.remove("hidden");
  byId("m-save").onclick = async () => {
    await api(`/api/incidents/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        actorId: currentUser().id,
        status: byId("m-status").value,
        priority: byId("m-priority").value,
        assigneeId: byId("m-assignee").value,
        isConfidential: canConf ? byId("m-conf").checked : inc.isConfidential,
        allowedUserIds: canConf ? [...byId("m-allowed").selectedOptions].map((o) => o.value) : inc.allowedUserIds
      })
    });
    await refreshAndRender();
    await openIncidentModal(id);
  };
  byId("m-comment-save").onclick = async () => {
    const body = byId("m-comment").value.trim();
    if (!body) return;
    await api(`/api/incidents/${id}/comments`, {
      method: "POST",
      body: JSON.stringify({ authorId: currentUser().id, body })
    });
    await refreshAndRender();
    await openIncidentModal(id);
  };
}

function renderAccountPanel() {
  byId("accounts").innerHTML = `
    <div class="panel-card">
      <div class="panel-head">
        <h2 class="panel-title">アカウント登録</h2>
        <p class="panel-desc">アカウント名とメールアドレスを登録します。登録時に通知ログが作成されます。</p>
      </div>
      <div class="form-grid">
        <label class="field"><span class="field-label">アカウント名 *</span><input id="a-name" placeholder="例: 山田 太郎" autocomplete="name" /></label>
        <label class="field"><span class="field-label">メールアドレス *</span><input id="a-email" type="email" placeholder="例: yamada@example.com" autocomplete="email" /></label>
      </div>
      <div class="form-actions form-actions--compact">
        <button type="button" id="a-create" class="btn-primary">登録する</button>
      </div>
    </div>
    <div class="panel-card">
      <h3 class="section-heading">登録済みアカウント</h3>
      <table><thead><tr><th>ID</th><th>名前</th><th>メール</th><th>ロール</th><th>操作</th></tr></thead>
      <tbody>
        ${state.users
          .map(
            (u) =>
              `<tr><td>${u.id}</td><td>${u.name}</td><td>${u.email}</td><td>${u.role}</td><td><button class="secondary" data-account-del="${u.id}">削除</button></td></tr>`
          )
          .join("")}
      </tbody></table>
    </div>
  `;
  byId("a-create").onclick = async () => {
    const name = byId("a-name").value.trim();
    const email = byId("a-email").value.trim();
    if (!name || !email) return alert("名前とメールを入力してください。");
    await api("/api/accounts", { method: "POST", body: JSON.stringify({ name, email }) });
    await refreshAndRender();
    alert("アカウントを登録し、メール通知ログを作成しました。");
  };
  document.querySelectorAll("[data-account-del]").forEach((b) => {
    b.onclick = async () => {
      if (!confirm("アカウントを削除しますか？")) return;
      await api(`/api/accounts/${b.dataset.accountDel}`, { method: "DELETE" });
      await refreshAndRender();
    };
  });
}

function renderMyPage() {
  const me = currentUser();
  const visible = state.incidents.filter((i) => canSee(i));
  const myAssign = visible.filter((i) => i.assigneeId === me.id && i.status !== "クローズ");
  const myReported = visible.filter((i) => i.reporterId === me.id).slice(0, 8);
  byId("mypage").innerHTML = `
    <div class="panel-card">
      <div class="panel-head">
        <h2 class="panel-title">マイページ</h2>
        <p class="panel-desc">ログインユーザーに関連するインシデントです。</p>
      </div>
      <div class="two-col mypage-cols">
        <div>
          <h3 class="section-heading">自分が担当の未クローズ</h3>
          <ul class="dash-list">${myAssign.map((i) => `<li><strong>${i.id}</strong> ${i.title} <span class="muted">(${i.status})</span></li>`).join("") || "<li class=\"muted\">なし</li>"}</ul>
        </div>
        <div>
          <h3 class="section-heading">自分が起票した直近</h3>
          <ul class="dash-list">${myReported.map((i) => `<li><strong>${i.id}</strong> ${i.title} <span class="muted">${fmt(i.createdAt)}</span></li>`).join("") || "<li class=\"muted\">なし</li>"}</ul>
        </div>
      </div>
    </div>
  `;
}

function renderNotifications() {
  byId("notifications").innerHTML = `
    <div class="panel-card">
      <div class="panel-head">
        <h2 class="panel-title">通知ログ</h2>
        <p class="panel-desc">起票・アサインなどの通知履歴です。</p>
      </div>
      <ul class="notif-list">${state.notifications.map((n) => `<li><time class="notif-time">${fmt(n.createdAt)}</time> <span class="notif-meta">[${n.type}] ${n.channel}</span><br/><span class="notif-msg">${escapeHtml(n.message)}</span></li>`).join("") || "<li class=\"muted\">通知なし</li>"}</ul>
    </div>
  `;
}

function exportCsv() {
  const list = filteredIncidents();
  const header = ["ID", "タイトル", "説明", "種別", "優先度", "ステータス", "機密", "起票者", "担当者", "発生日時", "起票日時", "クローズ日時"];
  const rows = list.map((i) => [
    i.id,
    i.title,
    i.description,
    i.type,
    i.priority,
    i.status,
    i.isConfidential ? "1" : "0",
    state.users.find((u) => u.id === i.reporterId)?.name || "",
    state.users.find((u) => u.id === i.assigneeId)?.name || "",
    i.occurredAt,
    i.createdAt,
    i.closedAt || ""
  ]);
  const csv = [header, ...rows]
    .map((r) => r.map((v) => `"${String(v || "").replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `incidents_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function wireTabs() {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
      document.querySelectorAll(".panel").forEach((x) => x.classList.remove("active"));
      btn.classList.add("active");
      byId(btn.dataset.tab).classList.add("active");
    };
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function refreshAndRender() {
  const tab = document.querySelector(".tab.active")?.dataset.tab || "dashboard";
  await loadData();
  render();
  document.querySelector(`.tab[data-tab="${tab}"]`)?.click();
}

byId("currentUser").addEventListener("change", (e) => {
  state.currentUserId = e.target.value;
  render();
});
byId("modalClose").addEventListener("click", () => byId("modal").classList.add("hidden"));
byId("modal").addEventListener("click", (e) => {
  if (e.target.id === "modal") byId("modal").classList.add("hidden");
});

function initFailureHint(message) {
  const m = String(message || "");
  if (window.location.protocol === "file:") {
    return "このHTMLを直接開いています。VercelのURLで開くか、ローカルでは vercel dev で起動してください。";
  }
  if (/404|NOT_FOUND|Not Found|Cannot GET/i.test(m)) {
    return "ページまたは API が見つかりません。Vercel の Root Directory を「リポジトリのルート（空欄）」にし、再デプロイしてください。インシデント管理だけを Root にすると /api が動きません。";
  }
  if (/Failed to parse URL|sb_publishable|URLとして解釈|キーが入っています|publishable キー|正しい Project URL/i.test(m)) {
    return "Vercel の SUPABASE_URL には、Supabase の「Project URL」（https://xxxx.supabase.co）だけを入れてください。sb_publishable_ で始まる値はキーなので URL 用ではありません。service_role は SUPABASE_SERVICE_ROLE_KEY に入れます。修正後は必ず Redeploy してください。";
  }
  if (/SUPABASE|Environment Variables|service_role|NEXT_PUBLIC_SUPABASE/i.test(m)) {
    return "Vercel → Project → Settings → Environment Variables に、Supabase の Project URL と service_role キーを登録してください（名前は SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY）。保存後、Deployments から Redeploy が必要です。";
  }
  return m;
}

init().catch((e) => {
  console.error(e);
  alert(`初期化に失敗しました。\n\n${initFailureHint(e.message)}`);
});
