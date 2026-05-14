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

// ===== Auth gate =====
(async function gate() {
  if (!sb) {
    showAdminLogin("Supabase chưa cấu hình");
    return;
  }
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    showAdminLogin();
    return;
  }
  const { data: p } = await sb.from("profiles").select("username, role").eq("id", user.id).maybeSingle();
  if (!p || p.role !== "admin") {
    showAdminLogin(`Tài khoản "${p?.username || user.email}" không có quyền admin`);
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
          <span class="brand-word">Kinglove</span>
          <span class="brand-num">69</span>
        </div>
        <h1>Admin Login</h1>
        ${errorMsg ? `<p class="admin-login-error">${errorMsg}</p>` : ""}
        <form data-admin-login-form>
          <input name="username" placeholder="Username admin" autocomplete="username" required />
          <input name="password" placeholder="Mật khẩu" type="password" autocomplete="current-password" required />
          <button type="submit">Đăng nhập admin</button>
        </form>
        <p class="admin-login-foot">
          <a href="./profile.html">Về trang Của tôi</a>
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
    btn.textContent = "Đang đăng nhập…";

    await sb.auth.signOut();
    const email = `${username.toLowerCase()}@kinglove69.com`;
    const { data, error } = await sb.auth.signInWithPassword({ email, password });

    if (error) {
      showError("Sai username hoặc mật khẩu");
      return;
    }

    const { data: p } = await sb.from("profiles")
      .select("username, role").eq("id", data.user.id).maybeSingle();
    if (!p || p.role !== "admin") {
      await sb.auth.signOut();
      showError(`User "${p?.username || username}" không có quyền admin`);
      return;
    }

    window.location.reload();

    function showError(msg) {
      btn.disabled = false;
      btn.textContent = "Đăng nhập admin";
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
let autoRefreshTimer = 0;

function init() {
  document.querySelectorAll(".admin-tabs .tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".admin-tabs .tab").forEach((t) => t.classList.toggle("is-active", t === tab));
      document.querySelectorAll("[data-panel]").forEach((p) => {
        p.hidden = p.dataset.panel !== tab.dataset.tab;
        p.classList.toggle("is-active", p.dataset.panel === tab.dataset.tab);
      });
      if (tab.dataset.tab === "users") loadUsers();
      if (tab.dataset.tab === "dashboard") loadDashboard();
      if (tab.dataset.tab === "notifications") loadNotifications();
      if (tab.dataset.tab === "transactions") loadTransactions();
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
    else if (a === "toggle-role") toggleRole(t.dataset.userId, t.dataset.role);
    else if (a === "send-notification") sendNotification();
    else if (a === "approve-tx") doApproveTx(Number(t.dataset.txId), true);
    else if (a === "reject-tx") doApproveTx(Number(t.dataset.txId), false);
  });

  document.querySelectorAll("[data-tx-filter] .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("[data-tx-filter] .chip").forEach((c) => c.classList.toggle("is-active", c === chip));
      txFilter = chip.dataset.txStatus;
      loadTransactions();
    });
  });

  document.querySelector("[data-user-search]")?.addEventListener("input", (e) => {
    loadUsers(e.target.value.trim());
  });

  loadRounds();
  loadAllRounds();

  // Realtime — admin nhận yêu cầu giao dịch mới
  sb.channel("admin-tx")
    .on("postgres_changes",
      { event: "INSERT", schema: "public", table: "transactions" },
      (payload) => {
        toast(`Có yêu cầu ${payload.new.type === "deposit" ? "nạp" : "rút"} mới · ${fmtNum(payload.new.amount)}đ`, "success");
        const activePanel = document.querySelector(".tab.is-active")?.dataset.tab;
        if (activePanel === "transactions") loadTransactions();
      }
    )
    .subscribe();

  // Realtime — admin thấy bet mới trong round đang chọn
  sb.channel("admin-bets")
    .on("postgres_changes",
      { event: "INSERT", schema: "public", table: "vote_history" },
      (payload) => {
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
  if (!confirm("Đóng round này? Sẽ không cho cược mới, nhưng chưa settle.")) return;
  const { error } = await sb.from("vote_rounds").update({ status: "closed", close_at: new Date().toISOString() }).eq("id", roundId);
  if (error) { toast(error.message, "error"); return; }
  toast("Đã đóng round", "success");
  loadRounds(); loadAllRounds();
}

// ===== Delete unsettled round =====
async function doDeleteRound(roundId) {
  if (!confirm("Xóa round này? Tất cả bets sẽ bị xóa và hoàn tiền cho user.")) return;
  const { data, error } = await sb.rpc("delete_round_with_refund", { p_round_id: roundId });
  if (error) { toast(error.message, "error"); return; }
  toast(`Đã xóa round + hoàn ${data.bets_deleted} bets · ${fmtNum(data.total_refunded)}đ`, "success");
  if (currentRoundId === roundId) {
    currentRoundId = null;
    document.querySelector("[data-current-round-label]").textContent = "(chưa chọn round)";
    document.querySelector("[data-choice-dist]").innerHTML = '<p class="muted">Chọn round bên trên để xem phân bố cược</p>';
    document.querySelector("[data-bets-body]").innerHTML = '<tr><td colspan="7" class="muted">Chọn round bên trên</td></tr>';
    document.querySelector("[data-settle-bar]").hidden = true;
  }
  loadRounds(); loadAllRounds();
}

// ===== Notifications =====
async function loadNotifications() {
  const wrap = document.querySelector("[data-panel='notifications']");
  if (!wrap.querySelector("[data-notif-list]")) {
    wrap.innerHTML = `
      <div class="panel-head"><h1>Thông báo hệ thống</h1></div>
      <section class="card">
        <h2>Gửi thông báo mới</h2>
        <div class="notif-form">
          <input name="notif-title" placeholder="Tiêu đề" data-notif-title />
          <textarea name="notif-body" placeholder="Nội dung" rows="4" data-notif-body></textarea>
          <button class="btn-primary" type="button" data-action="send-notification">Gửi cho tất cả</button>
        </div>
      </section>
      <section class="card">
        <h2>Thông báo đã gửi</h2>
        <div data-notif-list><p class="muted">Đang tải…</p></div>
      </section>
    `;
  }
  const { data, error } = await sb.from("notifications").select("*").order("created_at", { ascending: false }).limit(50);
  const list = document.querySelector("[data-notif-list]");
  if (error) { list.innerHTML = `<p class="muted">${esc(error.message)}</p>`; return; }
  if (!data.length) { list.innerHTML = '<p class="muted">Chưa có thông báo nào</p>'; return; }
  list.innerHTML = data.map((n) => `
    <article class="notif-item">
      <h4>${esc(n.title)}</h4>
      <p>${esc(n.body).replace(/\n/g, "<br>")}</p>
      <time>${fmtTime(n.created_at)} · ${n.audience}</time>
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
  if (!data.length) { tbody.innerHTML = '<tr><td colspan="7" class="muted">Không có giao dịch</td></tr>'; return; }

  const typeLabel = { deposit: "Nạp", withdraw: "Rút", vote: "Cược", reward: "Thưởng", refund: "Hoàn" };
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
          <button class="btn-link" data-action="approve-tx" data-tx-id="${t.id}">Duyệt</button>
          <button class="btn-link danger" data-action="reject-tx" data-tx-id="${t.id}">Từ chối</button>
        ` : "—"}
      </td>
    </tr>
  `).join("");
}

async function doApproveTx(txId, approve) {
  const word = approve ? "duyệt" : "từ chối";
  if (!confirm(`Bạn chắc chắn ${word} giao dịch này?`)) return;
  const { data, error } = await sb.rpc("approve_transaction", { p_tx_id: txId, p_approve: approve });
  if (error) { toast(error.message, "error"); return; }
  toast(approve ? `Đã ${word} ${fmtNum(data.amount)}đ` : "Đã từ chối", "success");
  loadTransactions();
}

async function sendNotification() {
  const title = document.querySelector("[data-notif-title]").value.trim();
  const body = document.querySelector("[data-notif-body]").value.trim();
  if (!title || !body) { toast("Nhập đủ tiêu đề và nội dung", "error"); return; }
  const { error } = await sb.from("notifications").insert({ title, body, audience: "all" });
  if (error) { toast(error.message, "error"); return; }
  toast("Đã gửi thông báo", "success");
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
    wrap.innerHTML = '<p class="muted">Chưa có round nào đang mở. Bấm "+ Tạo round mới".</p>';
    return;
  }
  wrap.innerHTML = data.map((r) => `
    <div class="round-card${r.round_id === currentRoundId ? " is-selected" : ""}" data-round-id="${r.round_id}">
      <div class="title">
        <h3>VOTE ${r.vote_type} · ${esc(r.round_no)}</h3>
        <span class="badge badge--${r.status}">${r.status}</span>
      </div>
      <div class="row"><span class="muted">Hệ số</span><strong>×${r.multiplier}</strong></div>
      <div class="row"><span class="muted">Bets</span><strong>${r.bet_count}</strong></div>
      <div class="row"><span class="muted">Tổng cược</span><strong>${fmtNum(r.total_amount)}</strong></div>
      <div class="row"><span class="muted">Người chơi</span><strong>${r.unique_bettors}</strong></div>
      <div class="round-actions">
        ${r.status === "open" ? `<button class="btn-link" data-action="close-round" data-round-id="${r.round_id}">Đóng cược</button>` : ""}
        ${r.status !== "settled" ? `<button class="btn-link danger" data-action="delete-round" data-round-id="${r.round_id}">Xóa</button>` : ""}
      </div>
    </div>
  `).join("");
  wrap.querySelectorAll(".round-card").forEach((c) => {
    c.addEventListener("click", (e) => {
      if (e.target.closest("[data-action]")) return; // don't trigger select when clicking action button
      selectRound(Number(c.dataset.roundId));
    });
  });
}

async function loadAllRounds() {
  const tbody = document.querySelector("[data-all-rounds-body]");
  let q = sb.from("vote_round_stats").select("*");
  if (voteFilter !== "all") q = q.eq("vote_type", Number(voteFilter));
  const { data, error } = await q
    .order("open_at", { ascending: false })
    .limit(50);
  if (error) { tbody.innerHTML = `<tr><td colspan="8" class="muted">${esc(error.message)}</td></tr>`; return; }
  if (!data.length) { tbody.innerHTML = '<tr><td colspan="8" class="muted">Chưa có round</td></tr>'; return; }
  tbody.innerHTML = data.map((r) => `
    <tr class="clickable" data-round-id="${r.round_id}">
      <td>VOTE ${r.vote_type}</td>
      <td>${esc(r.round_no)}</td>
      <td><span class="badge badge--${r.status}">${r.status}</span></td>
      <td class="num">×${r.multiplier}</td>
      <td class="num">${r.bet_count}</td>
      <td class="num">${fmtNum(r.total_amount)}</td>
      <td>${esc(r.winning || "—")}</td>
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
  if (!round) { toast("Round không tìm thấy", "error"); return; }

  document.querySelector("[data-current-round-label]").textContent =
    `VOTE ${round.vote_type} · ${round.round_no} (${round.status})`;

  const settleBar = document.querySelector("[data-settle-bar]");
  if (round.status === "settled") {
    settleBar.hidden = true;
    document.querySelector("[data-settle-hint]").textContent = `Đã settle với kết quả: ${round.winning}`;
  } else {
    settleBar.hidden = false;
    document.querySelector("[data-settle-winning]").value = "";
    document.querySelector("[data-settle-hint]").textContent =
      `Hệ số ×${round.multiplier}. Sau khi settle sẽ cộng payout vào balance của winners.`;
  }

  const { data: bets, error } = await sb
    .from("vote_history")
    .select("id, user_id, choice, amount, payout, status, created_at, profiles(username)")
    .eq("round_id", id)
    .order("created_at", { ascending: false });
  const tbody = document.querySelector("[data-bets-body]");
  const distEl = document.querySelector("[data-choice-dist]");
  const countEl = document.querySelector("[data-bet-count]");

  if (error) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted">${esc(error.message)}</td></tr>`;
    distEl.innerHTML = `<p class="muted">${esc(error.message)}</p>`;
    return;
  }
  if (!bets.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="muted">Chưa có ai cược round này</td></tr>';
    distEl.innerHTML = '<p class="muted">Chưa có cược nào trong round này</p>';
    countEl.textContent = "0 bets";
    return;
  }

  countEl.textContent = `${bets.length} bets · tổng ${fmtNum(bets.reduce((s, b) => s + b.amount, 0))}`;

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
          <span class="choice-meta">${v.count} bets · ${v.bettors.size} người · ${sharePct}%</span>
        </div>
        <div class="choice-bar"><div class="choice-bar-fill" style="width:${pct}%"></div></div>
        <div class="choice-foot">
          <span>Tổng: <strong>${fmtNum(v.total)}</strong></span>
          <span>Payout nếu thắng: <strong>${fmtNum(payout)}</strong></span>
          <span class="${profit >= 0 ? "profit-pos" : "profit-neg"}">Nhà cái: <strong>${profit >= 0 ? "+" : ""}${fmtNum(profit)}</strong></span>
          ${canSettle ? `<button class="btn-quick-settle" data-action="quick-settle" data-choice="${esc(choice)}">Settle với "${esc(choice)}"</button>` : ""}
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
  if (!payload.round_no) { toast("Round no không được trống", "error"); return; }
  const { error } = await sb.from("vote_rounds").insert(payload);
  if (error) { toast(error.message, "error"); return; }
  toast("Đã tạo round", "success");
  modal.close();
  loadRounds(); loadAllRounds();
}

async function doSettleRound(quickChoice) {
  if (!currentRoundId) { toast("Chưa chọn round", "error"); return; }
  const winning = quickChoice || document.querySelector("[data-settle-winning]").value.trim();
  if (!winning) { toast("Nhập kết quả hoặc click vào choice", "error"); return; }
  if (!confirm(`Settle round với kết quả "${winning}"? Hành động này không hoàn tác.`)) return;
  const { data, error } = await sb.rpc("settle_round", { p_round_id: currentRoundId, p_winning: winning });
  if (error) { toast(error.message, "error"); return; }
  toast(`Settle xong. Winners: ${data.winners}, payout: ${fmtNum(data.total_payout)}`, "success");
  loadRounds(); loadAllRounds(); selectRound(currentRoundId);
}

// ===== USERS =====
async function loadUsers(search = "") {
  const tbody = document.querySelector("[data-users-body]");
  let q = sb.from("profiles")
    .select("id, username, role, balance_points, vote_points, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (search) q = q.ilike("username", `%${search}%`);
  const { data, error } = await q;
  if (error) { tbody.innerHTML = `<tr><td colspan="6" class="muted">${esc(error.message)}</td></tr>`; return; }
  if (!data.length) { tbody.innerHTML = '<tr><td colspan="6" class="muted">Không có user</td></tr>'; return; }
  tbody.innerHTML = data.map((u) => `
    <tr>
      <td><strong>${esc(u.username)}</strong></td>
      <td><span class="badge badge--${u.role === "admin" ? "win" : "settled"}">${u.role}</span></td>
      <td class="num">${fmtNum(u.balance_points)}</td>
      <td class="num">${fmtNum(u.vote_points)}</td>
      <td>${fmtTime(u.created_at)}</td>
      <td>
        <button class="btn-link" data-action="edit-balance" data-user-id="${u.id}" data-balance="${u.balance_points}">Sửa số dư</button>
        <button class="btn-link" data-action="toggle-role" data-user-id="${u.id}" data-role="${u.role}">${u.role === "admin" ? "Bỏ admin" : "Set admin"}</button>
      </td>
    </tr>
  `).join("");
}

async function editBalance(userId, oldBalance) {
  const v = prompt("Số dư mới (points):", oldBalance);
  if (v === null) return;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) { toast("Giá trị không hợp lệ", "error"); return; }
  const { error } = await sb.from("profiles").update({ balance_points: n }).eq("id", userId);
  if (error) { toast(error.message, "error"); return; }
  toast("Đã cập nhật số dư", "success");
  loadUsers(document.querySelector("[data-user-search]").value.trim());
}

async function toggleRole(userId, currentRole) {
  const next = currentRole === "admin" ? "member" : "admin";
  if (!confirm(`Đổi role sang "${next}"?`)) return;
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
  document.querySelector('[data-stat="user_count"]').textContent = userCount.count ?? "—";
  document.querySelector('[data-stat="open_rounds"]').textContent = openRounds.count ?? "—";
  const todayList = betsToday.data || [];
  document.querySelector('[data-stat="bets_today"]').textContent = todayList.length;
  document.querySelector('[data-stat="amount_today"]').textContent =
    fmtNum(todayList.reduce((s, b) => s + (b.amount || 0), 0));
}
