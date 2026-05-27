const sb = window.sb;
let currentUser = null;
let currentRoundId = null;
const toastEl = document.querySelector("[data-toast]");

function toast(msg, kind = "") {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  toastEl.className = "admin-toast" + (kind ? " is-" + kind : "");
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => (toastEl.hidden = true), 3000);
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function fmtNum(n) {
  return new Intl.NumberFormat("vi-VN").format(Number(n || 0));
}

function fmtTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("sv-SE").replace("T", " ");
}

// ===== Custom confirm / prompt (replaces ugly native dialogs) =====
function adminConfirm(message, options = {}) {
  return new Promise((resolve) => {
    const dlg = document.querySelector("[data-confirm-modal]");
    if (!dlg) return resolve(window.confirm(message));

    dlg.querySelector("[data-confirm-title]").textContent = options.title || "XÃ¡c nháº­n";
    dlg.querySelector("[data-confirm-message]").textContent = message;
    const input = dlg.querySelector("[data-confirm-input]");
    const showInput = !!options.input;
    input.hidden = !showInput;
    if (showInput) {
      input.value = options.defaultValue || "";
      input.placeholder = options.placeholder || "";
    }
    const okBtn = dlg.querySelector("[data-confirm-ok]");
    const cancelBtn = dlg.querySelector("[data-confirm-cancel]");
    okBtn.textContent = options.okText || "XÃ¡c nháº­n";
    cancelBtn.textContent = options.cancelText || "Há»§y";
    okBtn.className = "btn-primary" + (options.danger ? " btn-danger" : "");

    const cleanup = (result) => {
      okBtn.onclick = null;
      cancelBtn.onclick = null;
      dlg.onclose = null;
      dlg.close();
      resolve(result);
    };
    okBtn.onclick = () => cleanup(showInput ? (input.value.trim() || true) : true);
    cancelBtn.onclick = () => cleanup(false);
    dlg.onclose = () => cleanup(false);

    dlg.showModal();
    if (showInput) setTimeout(() => input.focus(), 30);
  });
}

function adminPrompt(message, defaultValue = "", options = {}) {
  return adminConfirm(message, { ...options, input: true, defaultValue });
}

// ===== Auth gate =====
(async function gate() {
  if (!sb) {
    showAdminLogin("Supabase chÆ°a cáº¥u hÃ¬nh");
    return;
  }
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    showAdminLogin();
    return;
  }
  const { data: p } = await sb.from("profiles").select("username, role").eq("id", user.id).maybeSingle();
  if (!p || p.role !== "admin") {
    showAdminLogin(`TÃ i khoáº£n "${p?.username || user.email}" khÃ´ng cÃ³ quyá»n admin`);
    return;
  }
  currentUser = { ...user, ...p };
  document.querySelector("[data-admin-name]").textContent = p.username;
  init();
})();

function showAdminLogin(errorMsg = "") {
  document.body.innerHTML = `
    <div class="admin-login-shell">
      <div class="admin-login-card">
        <div class="admin-login-brand">
          <span class="brand-word">Kinglove69</span>
        </div>
        <h1>Admin Login</h1>
        ${errorMsg ? `<p class="admin-login-error">${errorMsg}</p>` : ""}
        <form data-admin-login-form>
          <input name="username" placeholder="Username admin" autocomplete="username" required />
          <input name="password" placeholder="Máº­t kháº©u" type="password" autocomplete="current-password" required />
          <button type="submit">ÄÄƒng nháº­p admin</button>
        </form>
        <p class="admin-login-foot">
          <a href="./profile.html">Vá» trang Cá»§a tÃ´i</a>
        </p>
      </div>
    </div>
  `;

  const form = document.querySelector("[data-admin-login-form]");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const username = String(fd.get("username") || "").trim();
    const password = String(fd.get("password") || "");
    if (!username || !password) return;

    const btn = form.querySelector("button");
    btn.disabled = true;
    btn.textContent = "Äang Ä‘Äƒng nháº­pâ€¦";

    await sb.auth.signOut();
    const email = `${username.toLowerCase()}@kinglove69.com`;
    const { data, error } = await sb.auth.signInWithPassword({ email, password });

    if (error) {
      showError("Sai username hoáº·c máº­t kháº©u");
      return;
    }

    const { data: p } = await sb.from("profiles")
      .select("username, role").eq("id", data.user.id).maybeSingle();
    if (!p || p.role !== "admin") {
      await sb.auth.signOut();
      showError(`User "${p?.username || username}" khÃ´ng cÃ³ quyá»n admin`);
      return;
    }

    window.location.reload();

    function showError(msg) {
      btn.disabled = false;
      btn.textContent = "ÄÄƒng nháº­p admin";
      let err = form.parentElement.querySelector(".admin-login-error");
      if (!err) {
        err = document.createElement("p");
        err.className = "admin-login-error";
        form.parentElement.insertBefore(err, form);
      }
      err.textContent = msg;
    }
  });
}

let voteFilter = "all";
let txFilter = "pending";
let wFilter = "pending";
let autoRefreshTimer = 0;

function init() {
  document.querySelectorAll(".admin-tabs .tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".admin-tabs .tab").forEach((t) => t.classList.toggle("is-active", t === tab));
      document.querySelectorAll("[data-panel]").forEach((p) => {
        p.hidden = p.dataset.panel !== tab.dataset.tab;
        p.classList.toggle("is-active", p.dataset.panel === tab.dataset.tab);
      });
      if (tab.dataset.tab === "users") {
        loadUsers();
        loadInviteCodes();
      }
      if (tab.dataset.tab === "dashboard") loadDashboard();
      if (tab.dataset.tab === "notifications") loadNotifications();
      if (tab.dataset.tab === "transactions") loadTransactions();
      if (tab.dataset.tab === "withdraws") loadWithdraws();
      // Clear badge of clicked tab
      setBadge(tab.dataset.tab, 0);
    });
  });

  // Filter chips
  document.querySelectorAll("[data-vote-filter] .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("[data-vote-filter] .chip").forEach((c) => c.classList.toggle("is-active", c === chip));
      voteFilter = chip.dataset.filter;
      loadRounds();
    });
  });

  // Auto-refresh
  const refreshToggle = document.querySelector("[data-auto-refresh]");
  function tickAutoRefresh() {
    clearInterval(autoRefreshTimer);
    if (refreshToggle?.checked) {
      autoRefreshTimer = setInterval(() => {
        loadRounds();
        loadAllRounds();
        if (currentRoundId) selectRound(currentRoundId);
      }, 15000);
    }
  }
  refreshToggle?.addEventListener("change", tickAutoRefresh);
  tickAutoRefresh();

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-action]");
    if (!t) return;
    const a = t.dataset.action;
    if (a === "admin-logout") doLogout();
    else if (a === "open-create-round") openCreateRound();
    else if (a === "close-modal") closeAllModals();
    else if (a === "submit-create-round") submitCreateRound();
    else if (a === "settle-round") doSettleRound();
    else if (a === "quick-settle") doSettleRound(t.dataset.choice);
    else if (a === "close-round") doCloseRound(Number(t.dataset.roundId));
    else if (a === "delete-round") doDeleteRound(Number(t.dataset.roundId));
    else if (a === "edit-balance") editBalance(t.dataset.userId, t.dataset.balance);
    else if (a === "adjust-balance") openAdjustBalance(t.dataset.userId, t.dataset.username, t.dataset.balance, t.dataset.mode);
    else if (a === "submit-adjust") submitAdjustBalance();
    else if (a === "send-notification") sendNotification();
    else if (a === "open-create-invite") openCreateInvite();
    else if (a === "submit-create-invite") submitCreateInvite();
    else if (a === "copy-invite") copyInviteCode(t.dataset.inviteCode);
    else if (a === "approve-tx") {
      const txId = Number(t.dataset.txId);
      if (document.querySelector(".tab.is-active")?.dataset.tab === "withdraws") doApproveWithdraw(txId, true);
      else doApproveTx(txId, true);
    }
    else if (a === "reject-tx") {
      const txId = Number(t.dataset.txId);
      if (document.querySelector(".tab.is-active")?.dataset.tab === "withdraws") doApproveWithdraw(txId, false);
      else doApproveTx(txId, false);
    }
    else if (a === "user-history") openUserHistory(t.dataset.userId, t.dataset.username);
    else if (a === "user-withdraws") openUserWithdraws(t.dataset.userId, t.dataset.username);
    else if (a === "toggle-freeze") toggleFreeze(t.dataset.userId, t.dataset.username, t.dataset.frozen === "1");
    else if (a === "approve-withdraw") doApproveWithdraw(Number(t.dataset.wId), true);
    else if (a === "reject-withdraw") doApproveWithdraw(Number(t.dataset.wId), false);
    else if (a === "edit-bank") openBankEdit(t.dataset.userId, t.dataset.username);
    else if (a === "submit-edit-bank") submitBankEdit();
    else if (a === "delete-bank") deleteBankForUser();
  });

  document.querySelectorAll("[data-tx-filter] .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("[data-tx-filter] .chip").forEach((c) => c.classList.toggle("is-active", c === chip));
      txFilter = chip.dataset.txStatus;
      loadTransactions();
    });
  });

  document.querySelectorAll("[data-w-filter] .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("[data-w-filter] .chip").forEach((c) => c.classList.toggle("is-active", c === chip));
      wFilter = chip.dataset.wStatus;
      loadWithdraws();
    });
  });

  document.querySelector("[data-user-search]")?.addEventListener("input", (e) => {
    loadUsers(e.target.value.trim());
  });

  loadRounds();
  loadAllRounds();
  refreshBadges();

  // Realtime â€” admin nháº­n yÃªu cáº§u rÃºt tiá»n má»›i
  sb.channel("admin-tx")
    .on("postgres_changes",
      { event: "INSERT", schema: "public", table: "transactions" },
      (payload) => {
        if (payload.new.type !== "withdraw") return;
        toast(`YÃªu cáº§u RÃšT má»›i Â· ${fmtNum(Math.floor(payload.new.amount / 1000))}K`, "success");
        bumpBadge("withdraws");
        const activePanel = document.querySelector(".tab.is-active")?.dataset.tab;
        if (activePanel === "withdraws") loadWithdraws();
      }
    )
    .subscribe();

  // Realtime â€” admin tháº¥y bet má»›i trong round Ä‘ang chá»n
  sb.channel("admin-bets")
    .on("postgres_changes",
      { event: "INSERT", schema: "public", table: "vote_history" },
      (payload) => {
        bumpBadge("votes");
        toast(`User vá»«a cÆ°á»£c: ${esc(payload.new.choice)} Â· ${fmtNum(payload.new.amount)}Ä‘`, "success");
        if (currentRoundId && Number(payload.new.round_id) === currentRoundId) {
          selectRound(currentRoundId);
        }
        loadRounds();
      }
    )
    .subscribe();
}

// ===== Force-close round =====
async function doCloseRound(roundId) {
  if (!(await adminConfirm("ÄÃ³ng round nÃ y? Sáº½ khÃ´ng cho cÆ°á»£c má»›i, nhÆ°ng chÆ°a settle.", { title: "ÄÃ³ng round" }))) return;
  const { error } = await sb.from("vote_rounds").update({ status: "closed", close_at: new Date().toISOString() }).eq("id", roundId);
  if (error) { toast(error.message, "error"); return; }
  toast("ÄÃ£ Ä‘Ã³ng round", "success");
  loadRounds(); loadAllRounds();
}

// ===== Delete unsettled round =====
async function doDeleteRound(roundId) {
  if (!(await adminConfirm("XÃ³a round nÃ y? Táº¥t cáº£ bets sáº½ bá»‹ xÃ³a vÃ  hoÃ n tiá»n cho user.", { title: "XÃ³a round", danger: true, okText: "XÃ³a" }))) return;
  const { data, error } = await sb.rpc("delete_round_with_refund", { p_round_id: roundId });
  if (error) { toast(error.message, "error"); return; }
  toast(`ÄÃ£ xÃ³a round + hoÃ n ${data.bets_deleted} bets Â· ${fmtNum(data.total_refunded)}Ä‘`, "success");
  if (currentRoundId === roundId) {
    currentRoundId = null;
    document.querySelector("[data-current-round-label]").textContent = "(chÆ°a chá»n round)";
    document.querySelector("[data-choice-dist]").innerHTML = '<p class="muted">Chá»n round bÃªn trÃªn Ä‘á»ƒ xem phÃ¢n bá»‘ cÆ°á»£c</p>';
    document.querySelector("[data-bets-body]").innerHTML = '<tr><td colspan="7" class="muted">Chá»n round bÃªn trÃªn</td></tr>';
    document.querySelector("[data-settle-bar]").hidden = true;
  }
  loadRounds(); loadAllRounds();
}

// ===== Notifications =====
async function loadNotifications() {
  const wrap = document.querySelector("[data-panel='notifications']");
  if (!wrap.querySelector("[data-notif-list]")) {
    wrap.innerHTML = `
      <div class="panel-head"><h1>ThÃ´ng bÃ¡o há»‡ thá»‘ng</h1></div>
      <section class="card">
        <h2>Gá»­i thÃ´ng bÃ¡o má»›i</h2>
        <div class="notif-form">
          <input name="notif-title" placeholder="TiÃªu Ä‘á»" data-notif-title />
          <textarea name="notif-body" placeholder="Ná»™i dung" rows="4" data-notif-body></textarea>
          <button class="btn-primary" type="button" data-action="send-notification">Gá»­i cho táº¥t cáº£</button>
        </div>
      </section>
      <section class="card">
        <h2>ThÃ´ng bÃ¡o Ä‘Ã£ gá»­i</h2>
        <div data-notif-list><p class="muted">Äang táº£iâ€¦</p></div>
      </section>
    `;
  }
  const { data, error } = await sb.from("notifications").select("*").order("created_at", { ascending: false }).limit(50);
  const list = document.querySelector("[data-notif-list]");
  if (error) { list.innerHTML = `<p class="muted">${esc(error.message)}</p>`; return; }
  if (!data.length) { list.innerHTML = '<p class="muted">ChÆ°a cÃ³ thÃ´ng bÃ¡o nÃ o</p>'; return; }
  list.innerHTML = data.map((n) => `
    <article class="notif-item">
      <h4>${esc(n.title)}</h4>
      <p>${esc(n.body).replace(/\n/g, "<br>")}</p>
      <time>${fmtTime(n.created_at)} Â· ${n.audience}</time>
    </article>
  `).join("");
}

// ===== Transactions =====
async function loadTransactions() {
  const tbody = document.querySelector("[data-tx-body]");
  if (!tbody) return;
  let q = sb.from("transactions")
    .select("id, user_id, type, amount, status, note, created_at, profiles(username)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (txFilter !== "all") q = q.eq("status", txFilter);
  const { data, error } = await q;
  if (error) { tbody.innerHTML = `<tr><td colspan="7" class="muted">${esc(error.message)}</td></tr>`; return; }
  if (!data.length) { tbody.innerHTML = '<tr><td colspan="7" class="muted">KhÃ´ng cÃ³ giao dá»‹ch</td></tr>'; return; }

  const typeLabel = { deposit: "Náº¡p", withdraw: "RÃºt", vote: "CÆ°á»£c", reward: "ThÆ°á»Ÿng", refund: "HoÃ n" };
  const statusColor = { pending: "#f59e0b", success: "#22c55e", failed: "#ef4444", cancelled: "#71757d" };

  tbody.innerHTML = data.map((t) => `
    <tr>
      <td><strong>${esc(t.profiles?.username || t.user_id.slice(0, 8))}</strong></td>
      <td>${typeLabel[t.type] || t.type}</td>
      <td class="num">${fmtNum(t.amount)}</td>
      <td>${esc(t.note || "")}</td>
      <td><span style="color:${statusColor[t.status] || "#fff"};font-weight:700">${t.status}</span></td>
      <td>${fmtTime(t.created_at)}</td>
      <td>
        ${t.status === "pending" ? `
          <button class="btn-link" data-action="approve-tx" data-tx-id="${t.id}">Duyá»‡t</button>
          <button class="btn-link danger" data-action="reject-tx" data-tx-id="${t.id}">Tá»« chá»‘i</button>
        ` : "â€”"}
      </td>
    </tr>
  `).join("");
}

async function doApproveTx(txId, approve) {
  const word = approve ? "duyá»‡t" : "tá»« chá»‘i";

  // Há»i note (Ä‘áº·c biá»‡t cáº§n khi tá»« chá»‘i Ä‘á»ƒ user biáº¿t lÃ½ do)
  const promptMsg = approve
    ? "Ghi chÃº (tÃ¹y chá»n, hiá»‡n cho user tháº¥y):"
    : "LÃ½ do tá»« chá»‘i (sáº½ hiá»‡n cho user):";
  const defaultVal = approve ? "" : "Lá»—i liÃªn káº¿t tÃ i khoáº£n ngÃ¢n hÃ ng (ThÃ´ng tin ngÆ°á»i nháº­n khÃ´ng trÃ¹ng khá»›p)";
  const note = await adminPrompt(promptMsg, defaultVal, {
    title: approve ? "Duyá»‡t giao dá»‹ch" : "Tá»« chá»‘i giao dá»‹ch",
    danger: !approve,
    okText: approve ? "Duyá»‡t" : "Tá»« chá»‘i",
    placeholder: "Ghi chÃº hiá»ƒn thá»‹ cho user",
  });
  if (note === false) return; // user báº¥m Há»§y

  // Update note trÆ°á»›c (vÃ¬ RPC chá»‰ approve/reject, khÃ´ng nháº­n note)
  const noteText = typeof note === "string" ? note.trim() : "";
  if (noteText) {
    await sb.from("transactions").update({ note: noteText }).eq("id", txId);
  }

  const { data, error } = await sb.rpc("approve_transaction", { p_tx_id: txId, p_approve: approve });
  if (error) { toast(error.message, "error"); return; }
  toast(approve ? `ÄÃ£ ${word} ${fmtNum(data.amount)}Ä‘` : "ÄÃ£ tá»« chá»‘i", "success");
  loadTransactions();
}

async function sendNotification() {
  const title = document.querySelector("[data-notif-title]").value.trim();
  const body = document.querySelector("[data-notif-body]").value.trim();
  if (!title || !body) { toast("Nháº­p Ä‘á»§ tiÃªu Ä‘á» vÃ  ná»™i dung", "error"); return; }
  const { error } = await sb.from("notifications").insert({ title, body, audience: "all" });
  if (error) { toast(error.message, "error"); return; }
  toast("ÄÃ£ gá»­i thÃ´ng bÃ¡o", "success");
  document.querySelector("[data-notif-title]").value = "";
  document.querySelector("[data-notif-body]").value = "";
  loadNotifications();
}

async function doLogout() {
  await sb.auth.signOut();
  window.location.href = "./index.html";
}

// ===== VOTE: open rounds =====
async function loadRounds() {
  const wrap = document.querySelector("[data-open-rounds]");
  let query = sb.from("vote_round_stats").select("*").in("status", ["open", "closed"]);
  if (voteFilter !== "all") query = query.eq("vote_type", Number(voteFilter));
  const { data, error } = await query.order("vote_type").order("open_at", { ascending: false });
  if (error) { wrap.innerHTML = `<p class="muted">${esc(error.message)}</p>`; return; }
  if (!data.length) {
    wrap.innerHTML = '<p class="muted">ChÆ°a cÃ³ round nÃ o Ä‘ang má»Ÿ. Báº¥m "+ Táº¡o round má»›i".</p>';
    return;
  }

  // Fetch bets cho táº¥t cáº£ rounds in 1 query (khÃ´ng join profiles Ä‘á»ƒ trÃ¡nh FK error)
  const roundIds = data.map((r) => r.round_id);
  const { data: bets } = await sb
    .from("vote_history")
    .select("round_id, user_id, choice, amount, created_at")
    .in("round_id", roundIds)
    .order("created_at", { ascending: false });

  // Fetch profiles riÃªng Ä‘á»ƒ map user_id â†’ username
  const userIds = [...new Set((bets || []).map((b) => b.user_id))];
  const userMap = {};
  if (userIds.length) {
    const { data: profs } = await sb.from("profiles").select("id, username").in("id", userIds);
    (profs || []).forEach((p) => (userMap[p.id] = p.username));
  }

  // Group bets by round â†’ by choice â†’ list users + amounts
  const byRound = {};
  (bets || []).forEach((b) => {
    const rid = b.round_id;
    if (!byRound[rid]) byRound[rid] = { choices: {}, users: {} };
    if (!byRound[rid].choices[b.choice]) {
      byRound[rid].choices[b.choice] = { total: 0, users: new Map() };
    }
    const ch = byRound[rid].choices[b.choice];
    ch.total += b.amount;
    const uname = userMap[b.user_id] || b.user_id.slice(0, 6);
    ch.users.set(uname, (ch.users.get(uname) || 0) + b.amount);
    byRound[rid].users[uname] = (byRound[rid].users[uname] || 0) + b.amount;
  });

  function renderChoicePreview(roundId) {
    const round = byRound[roundId];
    if (!round || !Object.keys(round.choices).length) {
      return '<div class="choice-preview"><span class="muted">ChÆ°a cÃ³ ai cÆ°á»£c</span></div>';
    }
    const sortedChoices = Object.entries(round.choices).sort((a, b) => b[1].total - a[1].total);
    const sortedUsers = Object.entries(round.users).sort((a, b) => b[1] - a[1]);

    return `
      <div class="choice-preview">
        ${sortedChoices.map(([c, info]) => {
          const userList = [...info.users.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([u, amt]) => `<span class="cu-user">${esc(u)}<em>${fmtNum(amt)}</em></span>`)
            .join("");
          return `
            <div class="choice-block">
              <div class="choice-block__head">
                <strong>${esc(c)}</strong>
                <span class="cb-total">${fmtNum(info.total)}</span>
              </div>
              <div class="choice-block__users">${userList}</div>
            </div>
          `;
        }).join("")}
        <div class="round-bettors">
          <span class="muted">NgÆ°á»i chÆ¡i:</span>
          ${sortedUsers.map(([u, amt]) => `<span class="bettor-tag">${esc(u)} Â· ${fmtNum(amt)}</span>`).join(" ")}
        </div>
      </div>
    `;
  }

  wrap.innerHTML = data.map((r) => `
    <div class="round-card${r.round_id === currentRoundId ? " is-selected" : ""}" data-round-id="${r.round_id}">
      <div class="title">
        <h3>VOTE ${r.vote_type} Â· ${esc(r.round_no)}</h3>
        <span class="badge badge--${r.status}">${r.status}</span>
      </div>
      <div class="row"><span class="muted">Há»‡ sá»‘</span><strong>Ã—${r.multiplier}</strong></div>
      <div class="row"><span class="muted">Bets</span><strong>${r.bet_count}</strong></div>
      <div class="row"><span class="muted">Tá»•ng cÆ°á»£c</span><strong>${fmtNum(r.total_amount)}</strong></div>
      <div class="row"><span class="muted">NgÆ°á»i chÆ¡i</span><strong>${r.unique_bettors}</strong></div>
      ${renderChoicePreview(r.round_id)}
      <div class="round-actions">
        ${r.status === "open" ? `<button class="btn-link" data-action="close-round" data-round-id="${r.round_id}">ÄÃ³ng cÆ°á»£c</button>` : ""}
        ${r.status !== "settled" ? `<button class="btn-link danger" data-action="delete-round" data-round-id="${r.round_id}">XÃ³a</button>` : ""}
      </div>
    </div>
  `).join("");
  wrap.querySelectorAll(".round-card").forEach((c) => {
    c.addEventListener("click", (e) => {
      if (e.target.closest("[data-action]")) return;
      selectRound(Number(c.dataset.roundId));
    });
  });

  // Auto-select first round náº¿u chÆ°a cÃ³ cÃ¡i nÃ o Ä‘Æ°á»£c chá»n
  if (!currentRoundId && data.length > 0) {
    selectRound(data[0].round_id);
  }
}

async function loadAllRounds() {
  const tbody = document.querySelector("[data-all-rounds-body]");
  let q = sb.from("vote_round_stats").select("*");
  if (voteFilter !== "all") q = q.eq("vote_type", Number(voteFilter));
  const { data, error } = await q
    .order("open_at", { ascending: false })
    .limit(50);
  if (error) { tbody.innerHTML = `<tr><td colspan="8" class="muted">${esc(error.message)}</td></tr>`; return; }
  if (!data.length) { tbody.innerHTML = '<tr><td colspan="8" class="muted">ChÆ°a cÃ³ round</td></tr>'; return; }
  tbody.innerHTML = data.map((r) => `
    <tr class="clickable" data-round-id="${r.round_id}">
      <td>VOTE ${r.vote_type}</td>
      <td>${esc(r.round_no)}</td>
      <td><span class="badge badge--${r.status}">${r.status}</span></td>
      <td class="num">Ã—${r.multiplier}</td>
      <td class="num">${r.bet_count}</td>
      <td class="num">${fmtNum(r.total_amount)}</td>
      <td>${esc(r.winning || "â€”")}</td>
      <td>${fmtTime(r.open_at)}</td>
    </tr>
  `).join("");
  tbody.querySelectorAll("tr.clickable").forEach((row) => {
    row.addEventListener("click", () => selectRound(Number(row.dataset.roundId)));
  });
}

async function selectRound(id) {
  currentRoundId = id;
  document.querySelectorAll(".round-card").forEach((c) =>
    c.classList.toggle("is-selected", Number(c.dataset.roundId) === id)
  );

  const { data: round } = await sb.from("vote_rounds").select("*").eq("id", id).maybeSingle();
  if (!round) { toast("Round khÃ´ng tÃ¬m tháº¥y", "error"); return; }

  document.querySelector("[data-current-round-label]").textContent =
    `VOTE ${round.vote_type} Â· ${round.round_no} (${round.status})`;

  const settleBar = document.querySelector("[data-settle-bar]");
  if (round.status === "settled") {
    settleBar.hidden = true;
    document.querySelector("[data-settle-hint]").textContent = `ÄÃ£ settle vá»›i káº¿t quáº£: ${round.winning}`;
  } else {
    settleBar.hidden = false;
    document.querySelector("[data-settle-winning]").value = "";
    document.querySelector("[data-settle-hint]").textContent =
      `Há»‡ sá»‘ Ã—${round.multiplier}. Sau khi settle sáº½ cá»™ng payout vÃ o balance cá»§a winners.`;
  }

  const { data: bets, error } = await sb
    .from("vote_history")
    .select("id, user_id, choice, amount, payout, status, created_at")
    .eq("round_id", id)
    .order("created_at", { ascending: false });
  // Map user_id â†’ username
  const _uids = [...new Set((bets || []).map((b) => b.user_id))];
  const _uMap = {};
  if (_uids.length) {
    const { data: _profs } = await sb.from("profiles").select("id, username").in("id", _uids);
    (_profs || []).forEach((p) => (_uMap[p.id] = p.username));
  }
  (bets || []).forEach((b) => (b.profiles = { username: _uMap[b.user_id] }));
  const tbody = document.querySelector("[data-bets-body]");
  const distEl = document.querySelector("[data-choice-dist]");
  const countEl = document.querySelector("[data-bet-count]");

  if (error) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted">${esc(error.message)}</td></tr>`;
    distEl.innerHTML = `<p class="muted">${esc(error.message)}</p>`;
    return;
  }
  if (!bets.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="muted">ChÆ°a cÃ³ ai cÆ°á»£c round nÃ y</td></tr>';
    distEl.innerHTML = '<p class="muted">ChÆ°a cÃ³ cÆ°á»£c nÃ o trong round nÃ y</p>';
    countEl.textContent = "0 bets";
    return;
  }

  countEl.textContent = `${bets.length} bets Â· tá»•ng ${fmtNum(bets.reduce((s, b) => s + b.amount, 0))}`;

  // ===== Choice distribution =====
  const byChoice = {};
  for (const b of bets) {
    const key = b.choice || "(empty)";
    if (!byChoice[key]) byChoice[key] = { count: 0, total: 0, bettors: new Set() };
    byChoice[key].count += 1;
    byChoice[key].total += b.amount;
    byChoice[key].bettors.add(b.user_id);
  }
  const sorted = Object.entries(byChoice).sort((a, b) => b[1].total - a[1].total);
  const maxTotal = Math.max(...sorted.map(([, v]) => v.total));
  const grandTotal = bets.reduce((s, b) => s + b.amount, 0);
  const canSettle = round.status !== "settled";

  distEl.innerHTML = sorted.map(([choice, v]) => {
    const pct = maxTotal > 0 ? (v.total / maxTotal * 100).toFixed(0) : 0;
    const sharePct = grandTotal > 0 ? (v.total / grandTotal * 100).toFixed(1) : 0;
    const payout = (v.total * round.multiplier);
    const profit = grandTotal - payout;
    return `
      <div class="choice-row">
        <div class="choice-head">
          <strong class="choice-name">${esc(choice)}</strong>
          <span class="choice-meta">${v.count} bets Â· ${v.bettors.size} ngÆ°á»i Â· ${sharePct}%</span>
        </div>
        <div class="choice-bar"><div class="choice-bar-fill" style="width:${pct}%"></div></div>
        <div class="choice-foot">
          <span>Tá»•ng: <strong>${fmtNum(v.total)}</strong></span>
          <span>Payout náº¿u tháº¯ng: <strong>${fmtNum(payout)}</strong></span>
          <span class="${profit >= 0 ? "profit-pos" : "profit-neg"}">NhÃ  cÃ¡i: <strong>${profit >= 0 ? "+" : ""}${fmtNum(profit)}</strong></span>
          ${canSettle ? `<button class="btn-quick-settle" data-action="quick-settle" data-choice="${esc(choice)}">Settle vá»›i "${esc(choice)}"</button>` : ""}
        </div>
      </div>
    `;
  }).join("");

  tbody.innerHTML = bets.map((b, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(b.profiles?.username || b.user_id.slice(0, 8))}</td>
      <td><strong>${esc(b.choice)}</strong></td>
      <td class="num">${fmtNum(b.amount)}</td>
      <td><span class="badge badge--${b.status}">${b.status}</span></td>
      <td class="num">${fmtNum(b.payout)}</td>
      <td>${fmtTime(b.created_at)}</td>
    </tr>
  `).join("");
}

function openCreateRound() {
  const modal = document.querySelector('[data-modal="create-round"]');
  const now = new Date();
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, "");
  modal.querySelector('[name="round_no"]').value = `${ymd}-001`;
  modal.showModal();
}

function closeAllModals() {
  document.querySelectorAll("dialog.modal").forEach((m) => m.close());
}

async function submitCreateRound() {
  const modal = document.querySelector('[data-modal="create-round"]');
  const f = modal.querySelector("form");
  const payload = {
    vote_type: Number(f.vote_type.value),
    round_no: f.round_no.value.trim(),
    multiplier: Number(f.multiplier.value),
    close_at: f.close_at.value ? new Date(f.close_at.value).toISOString() : null,
    created_by: currentUser.id,
  };
  if (!payload.round_no) { toast("Round no khÃ´ng Ä‘Æ°á»£c trá»‘ng", "error"); return; }
  const { error } = await sb.from("vote_rounds").insert(payload);
  if (error) { toast(error.message, "error"); return; }
  toast("ÄÃ£ táº¡o round", "success");
  modal.close();
  loadRounds(); loadAllRounds();
}

async function doSettleRound(quickChoice) {
  if (!currentRoundId) { toast("ChÆ°a chá»n round", "error"); return; }
  const winning = quickChoice || document.querySelector("[data-settle-winning]").value.trim();
  if (!winning) { toast("Nháº­p káº¿t quáº£ hoáº·c click vÃ o choice", "error"); return; }
  if (!(await adminConfirm(`Settle round vá»›i káº¿t quáº£ "${winning}"? HÃ nh Ä‘á»™ng nÃ y khÃ´ng hoÃ n tÃ¡c.`, { title: "Settle round", danger: true, okText: "Settle" }))) return;
  const { data, error } = await sb.rpc("settle_round", { p_round_id: currentRoundId, p_winning: winning });
  if (error) { toast(error.message, "error"); return; }
  toast(`Settle xong. Winners: ${data.winners}, payout: ${fmtNum(data.total_payout)}`, "success");
  loadRounds(); loadAllRounds(); selectRound(currentRoundId);
}

// ===== USERS =====
async function loadUsers(search = "") {
  const tbody = document.querySelector("[data-users-body]");
  let q = sb.from("profiles")
    .select("id, username, role, balance_points, vote_points, created_at, is_frozen")
    .order("created_at", { ascending: false })
    .limit(100);
  if (search) q = q.ilike("username", `%${search}%`);
  const { data, error } = await q;
  if (error) { tbody.innerHTML = `<tr><td colspan="6" class="muted">${esc(error.message)}</td></tr>`; return; }
  if (!data.length) { tbody.innerHTML = '<tr><td colspan="6" class="muted">KhÃ´ng cÃ³ user</td></tr>'; return; }

  // Fetch banks separately (1 query)
  const userIds = data.map((u) => u.id);
  const { data: banks } = await sb.from("bank_accounts")
    .select("id, user_id, bank_name, account_number, account_holder, created_at")
    .in("user_id", userIds)
    .order("created_at", { ascending: false });
  const bankByUser = {};
  (banks || []).forEach((b) => {
    if (!bankByUser[b.user_id]) bankByUser[b.user_id] = b;
  });

  tbody.innerHTML = data.map((u) => {
    const b = bankByUser[u.id];
    const bankCell = b
      ? `<small>${esc(b.bank_name)} Â· ${esc(b.account_number)}</small>`
      : `<small class="muted">chÆ°a liÃªn káº¿t</small>`;
    const frozen = !!u.is_frozen;
    const ds = `data-user-id="${u.id}" data-username="${esc(u.username)}"`;
    return `
    <tr${frozen ? ' class="user-frozen"' : ''}>
      <td>
        <strong>${esc(u.username)}</strong>
        ${frozen ? ' <span class="frozen-badge" title="TÃ i khoáº£n bá»‹ Ä‘Ã³ng bÄƒng">â„ FROZEN</span>' : ''}
      </td>
      <td><span class="badge badge--${u.role === "admin" ? "win" : "settled"}">${u.role}</span></td>
      <td class="num">${fmtNum(u.balance_points)}</td>
      <td class="num">${fmtNum(u.vote_points)}</td>
      <td>${fmtTime(u.created_at)}</td>
      <td>
        <div class="user-bank-info">${bankCell}</div>
        <div class="action-grid">
          <button class="act act--add" data-action="adjust-balance" ${ds} data-balance="${u.balance_points}" data-mode="add" title="Cá»™ng Ä‘iá»ƒm">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
            <span>Cá»™ng</span>
          </button>
          <button class="act act--sub" data-action="adjust-balance" ${ds} data-balance="${u.balance_points}" data-mode="sub" title="Trá»« Ä‘iá»ƒm">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14"/></svg>
            <span>Trá»«</span>
          </button>
          <button class="act act--info" data-action="user-history" ${ds} title="Lá»‹ch sá»­ VOTE">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
            <span>LS Vote</span>
          </button>
          <button class="act act--info" data-action="user-withdraws" ${ds} title="Lá»‹ch sá»­ rÃºt tiá»n">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5 12l7 7 7-7"/></svg>
            <span>LS RÃºt</span>
          </button>
          <button class="act act--neutral" data-action="edit-bank" ${ds} title="${b ? 'Sá»­a thÃ´ng tin ngÃ¢n hÃ ng' : 'ThÃªm thÃ´ng tin ngÃ¢n hÃ ng'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 11h10M7 15h6"/></svg>
            <span>${b ? "Sá»­a bank" : "ThÃªm bank"}</span>
          </button>
          <button class="act ${frozen ? 'act--unfreeze' : 'act--freeze'}" data-action="toggle-freeze" ${ds} data-frozen="${frozen ? '1' : '0'}" title="${frozen ? 'Má»Ÿ khÃ³a tÃ i khoáº£n' : 'ÄÃ³ng bÄƒng tÃ i khoáº£n'}">
            ${frozen
              ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0"/></svg>'
              : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19"/></svg>'}
            <span>${frozen ? "Má»Ÿ khÃ³a" : "ÄÃ³ng bÄƒng"}</span>
          </button>
        </div>
      </td>
    </tr>
  `;
  }).join("");
}

function generateInviteCode() {
  return `KLG${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function loadInviteCodes() {
  const tbody = document.querySelector("[data-invite-codes-body]");
  if (!tbody) return;
  const { data, error } = await sb.from("invite_codes")
    .select("code, status, created_at, created_by")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted">${esc(error.message)}</td></tr>`;
    return;
  }
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="muted">ChÆ°a cÃ³ mÃ£ giá»›i thiá»‡u</td></tr>';
    return;
  }
  const creatorIds = [...new Set(data.map((item) => item.created_by).filter(Boolean))];
  const creatorMap = {};
  if (creatorIds.length) {
    const { data: profiles } = await sb.from("profiles")
      .select("id, username")
      .in("id", creatorIds);
    (profiles || []).forEach((profile) => {
      creatorMap[profile.id] = profile.username;
    });
  }
  data.forEach((item) => {
    item.profiles = { username: creatorMap[item.created_by] || "-" };
  });
  const statusLabel = {
    active: "Hoáº¡t Ä‘á»™ng",
    disabled: "VÃ´ hiá»‡u",
  };
  tbody.innerHTML = data.map((item) => `
    <tr>
      <td><strong>${esc(item.code)}</strong></td>
      <td><span class="badge badge--${item.status === "active" ? "win" : "cancelled"}">${esc(statusLabel[item.status] || item.status)}</span></td>
      <td>${esc(item.profiles?.username || "â€”")}</td>
      <td>${fmtTime(item.created_at)}</td>
      <td><button class="btn-link" type="button" data-action="copy-invite" data-invite-code="${esc(item.code)}">Sao chÃ©p</button></td>
    </tr>
  `).join("");
}

function openCreateInvite() {
  const modal = document.querySelector('[data-modal="create-invite"]');
  const input = modal.querySelector('[name="code"]');
  input.value = generateInviteCode();
  modal.showModal();
  setTimeout(() => input.select(), 50);
}

async function copyInviteCode(inviteCode) {
  try {
    await navigator.clipboard.writeText(inviteCode);
    toast("ÄÃ£ sao chÃ©p mÃ£ giá»›i thiá»‡u vÃ o clipboard", "success");
  } catch (err) {
    toast("KhÃ´ng thá»ƒ sao chÃ©p mÃ£", "error");
  }
}

async function submitCreateInvite() {
  const modal = document.querySelector('[data-modal="create-invite"]');
  const code = modal.querySelector('[name="code"]').value.trim().toUpperCase();
  if (!code) { toast("Nháº­p mÃ£ giá»›i thiá»‡u", "error"); return; }
  const { error } = await sb.from("invite_codes").insert({ code, created_by: currentUser.id, status: "active" });
  if (error) { toast(error.message, "error"); return; }
  toast("ÄÃ£ táº¡o mÃ£ giá»›i thiá»‡u", "success");
  modal.close();
  loadInviteCodes();
}

// ===== Adjust balance (+/-) =====
let adjustState = { userId: null, mode: "add" };

function openAdjustBalance(userId, username, currentBalance, mode = "add") {
  adjustState = { userId, mode };
  const modal = document.querySelector('[data-modal="adjust-balance"]');
  modal.querySelector("[data-adjust-user]").textContent = `User: ${username}`;
  modal.querySelector("[data-adjust-current]").textContent = fmtNum(currentBalance) + " Ä‘iá»ƒm";
  // Set initial mode toggle
  modal.querySelectorAll("[data-adjust-mode]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.adjustMode === mode);
    btn.onclick = () => {
      adjustState.mode = btn.dataset.adjustMode;
      modal.querySelectorAll("[data-adjust-mode]").forEach((b) =>
        b.classList.toggle("is-active", b === btn)
      );
    };
  });
  const f = modal.querySelector("form");
  f.amount.value = "";
  f.note.value = "";
  modal.showModal();
  setTimeout(() => f.amount.focus(), 50);
}

async function submitAdjustBalance() {
  const modal = document.querySelector('[data-modal="adjust-balance"]');
  const f = modal.querySelector("form");
  const amount = Math.abs(parseInt(f.amount.value, 10));
  const note = f.note.value.trim();
  if (!Number.isFinite(amount) || amount <= 0) {
    toast("Sá»‘ Ä‘iá»ƒm pháº£i > 0", "error"); return;
  }
  const delta = adjustState.mode === "add" ? amount : -amount;
  const word = adjustState.mode === "add" ? "cá»™ng" : "trá»«";
  if (!(await adminConfirm(`${word.toUpperCase()} ${fmtNum(amount)} Ä‘iá»ƒm cho user?`, { title: "Äiá»u chá»‰nh Ä‘iá»ƒm", okText: word === "cá»™ng" ? "Cá»™ng" : "Trá»«" }))) return;

  const payload = {
    p_user_id: adjustState.userId,
    p_delta: delta,
    p_note: note || null,
  };
  let { data, error } = await sb.rpc("adjust_balance", payload);
  if (error?.message?.toLowerCase?.().includes("forbidden")) {
    await sb.auth.refreshSession();
    ({ data, error } = await sb.rpc("adjust_balance", payload));
  }
  if (error) {
    if (error.message?.toLowerCase?.().includes("forbidden")) {
      const { data: { user } } = await sb.auth.getUser();
      const { data: p } = user
        ? await sb.from("profiles").select("username, role").eq("id", user.id).maybeSingle()
        : { data: null };
      toast(`Current account is not accepted as admin (${p?.username || "not signed in"} / ${p?.role || "no-role"}). Logout, then login again with admin2026.`, "error");
      return;
    }
    toast(error.message, "error");
    return;
  }
  toast(`ÄÃ£ ${word} ${fmtNum(amount)} Ä‘iá»ƒm Â· sá»‘ dÆ° má»›i: ${fmtNum(data.new_balance)}`, "success");
  modal.close();
  loadUsers(document.querySelector("[data-user-search]").value.trim());
}

// ===== User VOTE history (admin xem lá»‹ch sá»­ cÆ°á»£c cá»§a 1 user) =====
async function openUserHistory(userId, username) {
  const modal = document.querySelector('[data-modal="user-history"]');
  modal.querySelector("[data-history-user]").textContent = `Lá»‹ch sá»­ VOTE â€” ${username}`;
  const tbody = modal.querySelector("[data-history-body]");
  const stats = modal.querySelector("[data-history-stats]");
  tbody.innerHTML = '<tr><td colspan="7" class="muted">Äang táº£iâ€¦</td></tr>';
  stats.textContent = "â€”";
  modal.showModal();

  const { data, error } = await sb
    .from("vote_history")
    .select("id, vote_type, choice, amount, status, payout, created_at, vote_rounds(round_no)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted">${esc(error.message)}</td></tr>`;
    return;
  }
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="muted">User chÆ°a cÆ°á»£c láº§n nÃ o</td></tr>';
    stats.textContent = "0 cÆ°á»£c";
    return;
  }

  const totalBet = data.reduce((s, b) => s + (b.amount || 0), 0);
  const totalPayout = data.reduce((s, b) => s + (b.payout || 0), 0);
  const winCount = data.filter((b) => b.status === "win").length;
  const loseCount = data.filter((b) => b.status === "lose").length;
  const pendingCount = data.filter((b) => b.status === "pending").length;

  stats.innerHTML = `
    <span><strong>${data.length}</strong> cÆ°á»£c</span>
    <span>Tá»•ng cÆ°á»£c: <strong>${fmtNum(totalBet)}</strong></span>
    <span>Tá»•ng nháº­n: <strong>${fmtNum(totalPayout)}</strong></span>
    <span class="${totalPayout - totalBet >= 0 ? 'win' : 'lose'}">Net: <strong>${(totalPayout - totalBet >= 0 ? '+' : '') + fmtNum(totalPayout - totalBet)}</strong></span>
    <span>Win/Lose/Pending: <strong>${winCount}/${loseCount}/${pendingCount}</strong></span>
  `;

  tbody.innerHTML = data.map((b) => `
    <tr>
      <td>${esc(b.vote_rounds?.round_no || "â€”")}</td>
      <td>VOTE ${b.vote_type}</td>
      <td><strong>${esc(b.choice || "â€”")}</strong></td>
      <td class="num">${fmtNum(b.amount)}</td>
      <td><span class="badge badge--${b.status}">${b.status}</span></td>
      <td class="num">${fmtNum(b.payout)}</td>
      <td>${fmtTime(b.created_at)}</td>
    </tr>
  `).join("");
}

// ===== User withdraw history (admin xem) =====
async function openUserWithdraws(userId, username) {
  const modal = document.querySelector('[data-modal="withdraw-history"]');
  modal.querySelector("[data-wh-user]").textContent = `Lá»‹ch sá»­ rÃºt tiá»n â€” ${username}`;
  const tbody = modal.querySelector("[data-wh-body]");
  const stats = modal.querySelector("[data-wh-stats]");
  tbody.innerHTML = '<tr><td colspan="5" class="muted">Äang táº£iâ€¦</td></tr>';
  stats.textContent = "â€”";
  modal.showModal();

  const { data, error } = await sb.from("transactions")
    .select("id, amount, status, note, created_at, updated_at")
    .eq("user_id", userId).eq("type", "withdraw")
    .order("created_at", { ascending: false }).limit(200);

  if (error) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted">${esc(error.message)}</td></tr>`;
    return;
  }
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="muted">User chÆ°a rÃºt láº§n nÃ o</td></tr>';
    stats.textContent = "0 giao dá»‹ch";
    return;
  }

  const total = data.reduce((s, t) => s + (t.amount || 0), 0);
  const successCount = data.filter((t) => t.status === "success").length;
  const pendingCount = data.filter((t) => t.status === "pending").length;
  const cancelledCount = data.filter((t) => t.status === "cancelled").length;

  stats.innerHTML = `
    <span><strong>${data.length}</strong> giao dá»‹ch</span>
    <span>Tá»•ng rÃºt: <strong>${fmtNum(total)}</strong></span>
    <span>OK/Chá»/Há»§y: <strong>${successCount}/${pendingCount}/${cancelledCount}</strong></span>
  `;

  tbody.innerHTML = data.map((t) => `
    <tr>
      <td class="num">âˆ’${fmtNum(t.amount)}</td>
      <td><span class="badge badge--${t.status}">${t.status}</span></td>
      <td>${esc(t.note || "â€”")}</td>
      <td>${fmtTime(t.created_at)}</td>
      <td>${fmtTime(t.updated_at || t.created_at)}</td>
    </tr>
  `).join("");
}

// ===== Duyá»‡t rÃºt tiá»n (tab RÃºt tiá»n) =====
async function loadWithdraws() {
  const tbody = document.querySelector("[data-withdraws-body]");
  if (!tbody) return;

  // Láº¥y táº¥t cáº£ withdraw transactions
  let q = sb.from("transactions")
    .select("id, user_id, amount, status, note, created_at, updated_at")
    .eq("type", "withdraw")
    .order("created_at", { ascending: false })
    .limit(200);
  if (wFilter !== "all") q = q.eq("status", wFilter);
  const { data, error } = await q;
  if (error) { tbody.innerHTML = `<tr><td colspan="7" class="muted">${esc(error.message)}</td></tr>`; return; }
  if (!data.length) { tbody.innerHTML = '<tr><td colspan="7" class="muted">KhÃ´ng cÃ³ yÃªu cáº§u rÃºt nÃ o</td></tr>'; return; }

  // Batch fetch usernames + banks
  const userIds = [...new Set(data.map((t) => t.user_id))];
  const { data: profs } = await sb.from("profiles").select("id, username").in("id", userIds);
  const userMap = {};
  (profs || []).forEach((p) => (userMap[p.id] = p.username));
  data.forEach((t) => (t.profiles = { username: userMap[t.user_id] }));
  const { data: banks } = await sb.from("bank_accounts")
    .select("id, user_id, bank_name, account_number, account_holder, created_at")
    .in("user_id", userIds)
    .order("created_at", { ascending: false });
  const bankByUser = {};
  (banks || []).forEach((b) => {
    if (!bankByUser[b.user_id]) bankByUser[b.user_id] = b;
  });

  const statusBadge = {
    pending: { label: "Chá» duyá»‡t", color: "#f59e0b" },
    success: { label: "ÄÃ£ duyá»‡t", color: "#18c269" },
    failed: { label: "Tháº¥t báº¡i", color: "#ef4444" },
    cancelled: { label: "Tá»« chá»‘i", color: "#71757d" },
  };

  tbody.innerHTML = data.map((t) => {
    const b = bankByUser[t.user_id];
    const k = Math.floor(t.amount / 1000);
    const status = statusBadge[t.status] || { label: t.status, color: "#fff" };
    const bankInfo = b
      ? `<div class="w-bank"><strong>${esc(b.bank_name)}</strong><br>${esc(b.account_number)}<br><span class="muted">${esc(b.account_holder)}</span></div>`
      : `<span class="muted">chÆ°a liÃªn káº¿t bank</span>`;
    return `
      <tr>
        <td><strong>${esc(t.profiles?.username || t.user_id.slice(0, 8))}</strong></td>
        <td class="num"><strong>${fmtNum(k)}K</strong><br><span class="muted">${fmtNum(t.amount)}Ä‘</span></td>
        <td>${bankInfo}</td>
        <td>${esc(t.note || "â€”")}</td>
        <td><span style="color:${status.color};font-weight:700">${status.label}</span></td>
        <td>${fmtTime(t.created_at)}</td>
        <td>
          ${t.status === "pending" ? `
            <button type="button" class="act act--add" data-action="approve-tx" data-tx-id="${t.id}" ${!b ? 'disabled title="ChÆ°a cÃ³ bank â€” khÃ´ng duyá»‡t Ä‘Æ°á»£c"' : ''}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              <span>Duyá»‡t</span>
            </button>
            <button type="button" class="act act--freeze" data-action="reject-tx" data-tx-id="${t.id}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              <span>Tá»« chá»‘i</span>
            </button>
          ` : "â€”"}
        </td>
      </tr>
    `;
  }).join("");
}

async function doApproveWithdraw(txId, approve) {
  if (approve) {
    // Láº¥y tx + bank info Ä‘á»ƒ admin xem trÆ°á»›c khi duyá»‡t
    const { data: tx } = await sb.from("transactions").select("*").eq("id", txId).maybeSingle();
    if (tx) {
      const { data: p } = await sb.from("profiles").select("username").eq("id", tx.user_id).maybeSingle();
      tx.profiles = { username: p?.username };
    }
    if (!tx) { toast("KhÃ´ng tÃ¬m tháº¥y giao dá»‹ch", "error"); return; }
    const { data: banks } = await sb.from("bank_accounts")
      .select("*")
      .eq("user_id", tx.user_id)
      .order("created_at", { ascending: false })
      .limit(1);
    const bank = banks?.[0];
    if (!bank) { toast("User chÆ°a liÃªn káº¿t bank â€” khÃ´ng duyá»‡t Ä‘Æ°á»£c", "error"); return; }
    const k = Math.floor(tx.amount / 1000);
    const msg = `Chuyá»ƒn khoáº£n Ä‘áº¿n tÃ i khoáº£n sau rá»“i xÃ¡c nháº­n:
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
User : ${tx.profiles?.username || tx.user_id.slice(0, 8)}
Tiá»n : ${fmtNum(k)}K (${fmtNum(tx.amount)}Ä‘)
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
NgÃ¢n hÃ ng : ${bank.bank_name}
Sá»‘ TK     : ${bank.account_number}
Chá»§ TK    : ${bank.account_holder}
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`;
    const note = await adminPrompt(msg, "", {
      title: "Duyá»‡t rÃºt tiá»n",
      okText: "ÄÃ£ chuyá»ƒn â€” Duyá»‡t",
      placeholder: "Ghi chÃº thÃªm (tÃ¹y chá»n)",
    });
    if (note === false) return;
    const noteText = typeof note === "string" ? note.trim() : "";
    if (noteText) await sb.from("transactions").update({ note: noteText }).eq("id", txId);
    const { error } = await sb.rpc("approve_transaction", { p_tx_id: txId, p_approve: true });
    if (error) { toast(error.message, "error"); return; }
    toast(`ÄÃ£ duyá»‡t rÃºt ${fmtNum(k)}K`, "success");
    loadWithdraws();
    refreshBadges();
  } else {
    // Reject â€” prompt lÃ½ do
    const reason = await adminPrompt(
      "LÃ½ do tá»« chá»‘i (sáº½ hiá»‡n cho user):\nSá»‘ tiá»n sáº½ tá»± Ä‘á»™ng hoÃ n vá» tÃ i khoáº£n user.",
      "Lá»—i liÃªn káº¿t tÃ i khoáº£n ngÃ¢n hÃ ng (ThÃ´ng tin ngÆ°á»i nháº­n khÃ´ng trÃ¹ng khá»›p)",
      { title: "Tá»« chá»‘i rÃºt tiá»n", danger: true, okText: "Tá»« chá»‘i + HoÃ n tiá»n" }
    );
    if (reason === false) return;
    const reasonText = typeof reason === "string" ? reason.trim() : "";
    if (reasonText) await sb.from("transactions").update({ note: reasonText }).eq("id", txId);
    const { error } = await sb.rpc("approve_transaction", { p_tx_id: txId, p_approve: false });
    if (error) { toast(error.message, "error"); return; }
    toast("ÄÃ£ tá»« chá»‘i vÃ  hoÃ n tiá»n", "success");
    loadWithdraws();
    refreshBadges();
  }
}

// ===== Freeze / unfreeze account =====
async function toggleFreeze(userId, username, isFrozen) {
  const action = isFrozen ? "Má»Ÿ khÃ³a" : "ÄÃ³ng bÄƒng";
  const ok = await adminConfirm(
    `${action.toUpperCase()} tÃ i khoáº£n "${username}"?\n${
      isFrozen
        ? "Sau khi má»Ÿ khÃ³a, user cÃ³ thá»ƒ cÆ°á»£c/rÃºt bÃ¬nh thÆ°á»ng."
        : "Sau khi Ä‘Ã³ng bÄƒng, user KHÃ”NG thá»ƒ cÆ°á»£c, rÃºt tiá»n. Sá»‘ dÆ° váº«n giá»¯ nguyÃªn."
    }`,
    { title: action, danger: !isFrozen, okText: action }
  );
  if (!ok) return;

  const { error } = await sb.from("profiles")
    .update({ is_frozen: !isFrozen }).eq("id", userId);
  if (error) { toast(error.message, "error"); return; }
  toast(`${action} thÃ nh cÃ´ng user "${username}"`, "success");
  loadUsers(document.querySelector("[data-user-search]")?.value.trim() || "");
}

// ===== Tab badge counter =====
const badgeState = { votes: 0, transactions: 0 };
function setBadge(name, value) {
  badgeState[name] = value;
  const el = document.querySelector(`[data-badge="${name}"]`);
  if (!el) return;
  if (value > 0) {
    el.textContent = String(value);
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}
function bumpBadge(name) {
  // Chá»‰ bump náº¿u tab Ä‘Ã³ khÃ´ng pháº£i active
  const activeTab = document.querySelector(".tab.is-active")?.dataset.tab;
  if (activeTab === name) return;
  setBadge(name, (badgeState[name] || 0) + 1);
}

async function refreshBadges() {
  // Pending withdraw count
  const { count: wCount } = await sb.from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("type", "withdraw").eq("status", "pending");
  setBadge("withdraws", wCount || 0);
  // Bets pending (chÆ°a settle)
  const { count: betCount } = await sb.from("vote_history")
    .select("id", { count: "exact", head: true }).eq("status", "pending");
  setBadge("votes", betCount || 0);
}

// ===== Bank edit for users (admin) =====
let editBankUserId = null;
async function openBankEdit(userId, username) {
  editBankUserId = userId;
  const modal = document.querySelector('[data-modal="edit-bank"]');
  document.querySelector("[data-bank-user-label]").textContent = `User: ${username}`;
  const f = modal.querySelector("form");
  // Pre-fill if exists
  const { data: banks } = await sb.from("bank_accounts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);
  const b = banks?.[0];
  f.bank_name.value = b?.bank_name || "";
  f.account_number.value = b?.account_number || "";
  f.account_holder.value = b?.account_holder || "";
  modal.dataset.exists = b ? "1" : "0";
  modal.showModal();
}

async function submitBankEdit() {
  const modal = document.querySelector('[data-modal="edit-bank"]');
  const f = modal.querySelector("form");
  const payload = {
    bank_name: f.bank_name.value.trim(),
    account_number: f.account_number.value.trim(),
    account_holder: f.account_holder.value.trim().toUpperCase(),
    is_primary: true,
  };
  if (!payload.bank_name || !payload.account_number || !payload.account_holder) {
    toast("Äiá»n Ä‘á»§ thÃ´ng tin", "error"); return;
  }
  let { data: savedRows, error } = await sb.from("bank_accounts")
    .update(payload)
    .eq("user_id", editBankUserId)
    .select("id");
  if (!error && !savedRows?.length) {
    const inserted = await sb.from("bank_accounts")
      .insert({ ...payload, user_id: editBankUserId })
      .select("id");
    savedRows = inserted.data;
    error = inserted.error;
  }
  if (error) { toast(error.message, "error"); return; }
  if (savedRows?.length > 1) {
    await sb.from("bank_accounts")
      .delete()
      .eq("user_id", editBankUserId)
      .neq("id", savedRows[0].id);
  }
  toast("ÄÃ£ lÆ°u bank", "success");
  modal.close();
  loadUsers(document.querySelector("[data-user-search]").value.trim());
}

async function deleteBankForUser() {
  if (!(await adminConfirm("XÃ³a bank cá»§a user nÃ y?", { title: "XÃ³a bank", danger: true, okText: "XÃ³a" }))) return;
  const { error } = await sb.from("bank_accounts").delete().eq("user_id", editBankUserId);
  if (error) { toast(error.message, "error"); return; }
  toast("ÄÃ£ xÃ³a bank", "success");
  document.querySelector('[data-modal="edit-bank"]').close();
  loadUsers(document.querySelector("[data-user-search]").value.trim());
}

async function editBalance(userId, oldBalance) {
  const v = prompt("Sá»‘ dÆ° má»›i (points):", oldBalance);
  if (v === null) return;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) { toast("GiÃ¡ trá»‹ khÃ´ng há»£p lá»‡", "error"); return; }
  const { error } = await sb.from("profiles").update({ balance_points: n }).eq("id", userId);
  if (error) { toast(error.message, "error"); return; }
  toast("ÄÃ£ cáº­p nháº­t sá»‘ dÆ°", "success");
  loadUsers(document.querySelector("[data-user-search]").value.trim());
}

async function toggleRole(userId, currentRole) {
  const next = currentRole === "admin" ? "member" : "admin";
  if (!(await adminConfirm(`Äá»•i role sang "${next}"?`, { title: "Äá»•i role" }))) return;
  const { error } = await sb.from("profiles").update({ role: next }).eq("id", userId);
  if (error) { toast(error.message, "error"); return; }
  toast(`Role: ${next}`, "success");
  loadUsers(document.querySelector("[data-user-search]").value.trim());
}

// ===== DASHBOARD =====
async function loadDashboard() {
  const [userCount, openRounds, betsToday] = await Promise.all([
    sb.from("profiles").select("id", { count: "exact", head: true }),
    sb.from("vote_rounds").select("id", { count: "exact", head: true }).eq("status", "open"),
    sb.from("vote_history").select("amount").gte("created_at", new Date(new Date().toDateString()).toISOString()),
  ]);
  document.querySelector('[data-stat="user_count"]').textContent = userCount.count ?? "â€”";
  document.querySelector('[data-stat="open_rounds"]').textContent = openRounds.count ?? "â€”";
  const todayList = betsToday.data || [];
  document.querySelector('[data-stat="bets_today"]').textContent = todayList.length;
  document.querySelector('[data-stat="amount_today"]').textContent =
    fmtNum(todayList.reduce((s, b) => s + (b.amount || 0), 0));
}
