const sb = window.sb;
const fmt = new Intl.NumberFormat("vi-VN");
const fmtTime = (iso) => new Date(iso).toLocaleString("sv-SE").replace("T", " ").slice(0, 19);

const TX_LABEL = {
  deposit: { sign: "+", color: "#22c55e", label: "Nạp tiền" },
  withdraw: { sign: "-", color: "#ef4444", label: "Rút tiền" },
  vote: { sign: "-", color: "#ef4444", label: "Cược VOTE" },
  reward: { sign: "+", color: "#22c55e", label: "Thưởng" },
  refund: { sign: "+", color: "#22c55e", label: "Hoàn tiền" },
};
const STATUS_LABEL = {
  pending: "Chờ duyệt", success: "Hoàn tất", failed: "Thất bại", cancelled: "Đã hủy",
};

let user = null;

function showToast(msg) {
  let el = document.querySelector(".wallet-toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "wallet-toast";
    el.style.cssText = "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);" +
      "background:rgba(20,22,28,0.92);color:#fff;padding:14px 22px;border-radius:8px;" +
      "font-size:14px;z-index:9999;max-width:80%;text-align:center;line-height:1.4;";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.remove(), 2400);
}

async function loadWallet() {
  if (!sb) return;
  const { data: { user: u } } = await sb.auth.getUser();
  if (!u) { window.location.href = "./index.html"; return; }
  user = u;

  const { data: profile } = await sb.from("profiles")
    .select("balance_points").eq("id", u.id).maybeSingle();
  const available = profile?.balance_points || 0;
  const frozen = 0;

  document.querySelector("[data-available-text]").textContent = fmt.format(available);
  document.querySelector("[data-frozen-text]").textContent = fmt.format(frozen);
  document.querySelector("[data-total]").textContent = fmt.format(available + frozen);

  await loadTransactions();
}

async function loadTransactions() {
  const wrap = document.querySelector("[data-tx-list]");
  if (!wrap || !user) return;
  const { data, error } = await sb.from("transactions")
    .select("id, type, amount, status, note, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    wrap.innerHTML = `<p style="padding:20px;text-align:center;color:#ef4444">${error.message}</p>`;
    return;
  }
  if (!data.length) {
    wrap.innerHTML = '<p style="padding:20px;text-align:center;color:#9aa0ac">Chưa có giao dịch nào</p>';
    return;
  }
  wrap.innerHTML = data.map((t) => {
    const cfg = TX_LABEL[t.type] || { sign: "", color: "#111", label: t.type };
    const isPending = t.status === "pending";
    return `
      <article class="history-item">
        <span class="history-icon" style="color:${cfg.color};background:${cfg.color}1a">${cfg.sign === "+" ? "↘" : "↗"}</span>
        <div class="history-copy">
          <strong>${cfg.label} ${fmt.format(t.amount)} đ${t.note ? " · " + t.note : ""}</strong>
          <time datetime="${t.created_at}">${fmtTime(t.created_at)} · ${STATUS_LABEL[t.status] || t.status}</time>
        </div>
        <strong class="history-amount" style="color:${isPending ? "#9aa0ac" : cfg.color}">
          ${cfg.sign}${fmt.format(t.amount)} đ
        </strong>
      </article>
    `;
  }).join("");
}

// Wire deposit / withdraw buttons
document.querySelector(".wallet-action.deposit")?.addEventListener("click", () => {
  document.querySelector('[data-modal="deposit"]').showModal();
});

document.querySelector(".wallet-action.withdraw")?.addEventListener("click", () => {
  document.querySelector('[data-modal="withdraw"]').showModal();
});

document.querySelectorAll("[data-close]").forEach((b) => {
  b.addEventListener("click", () => b.closest("dialog")?.close());
});

document.querySelector("[data-submit-deposit]")?.addEventListener("click", async () => {
  const dlg = document.querySelector('[data-modal="deposit"]');
  const f = dlg.querySelector("form");
  const amount = Number(f.amount.value);
  const note = f.note.value.trim();
  if (!Number.isFinite(amount) || amount < 10000) { showToast("Số tiền tối thiểu 10.000đ"); return; }
  const { error } = await sb.from("transactions").insert({
    user_id: user.id, type: "deposit", amount, status: "pending", note: note || null,
  });
  if (error) { showToast("Lỗi: " + error.message); return; }
  dlg.close();
  f.reset();
  showToast("Đã gửi yêu cầu nạp, chờ admin duyệt");
  loadTransactions();
});

document.querySelector("[data-submit-withdraw]")?.addEventListener("click", async () => {
  const dlg = document.querySelector('[data-modal="withdraw"]');
  const f = dlg.querySelector("form");
  const amount = Number(f.amount.value);
  const note = f.note.value.trim();
  if (!Number.isFinite(amount) || amount < 10000) { showToast("Số tiền tối thiểu 10.000đ"); return; }

  // Check balance
  const { data: profile } = await sb.from("profiles").select("balance_points").eq("id", user.id).maybeSingle();
  if ((profile?.balance_points || 0) < amount) { showToast("Số dư không đủ"); return; }

  const { error } = await sb.from("transactions").insert({
    user_id: user.id, type: "withdraw", amount, status: "pending", note: note || null,
  });
  if (error) { showToast("Lỗi: " + error.message); return; }
  dlg.close();
  f.reset();
  showToast("Đã gửi yêu cầu rút, chờ admin duyệt");
  loadTransactions();
});

loadWallet();
