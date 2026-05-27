const sb = window.sb;
const amountInput = document.querySelector("[data-amount]");
const vndEl = document.querySelector("[data-vnd]");
const submitBtn = document.querySelector("[data-submit]");
const fillAllBtn = document.querySelector("[data-fill-all]");
const ruleLink = document.querySelector("[data-action='show-rule']");
const ruleModal = document.querySelector('[data-modal="rule"]');
const fmt = new Intl.NumberFormat("vi-VN");

const MIN_K = 1000;
const MAX_K = 1000000; // Giới hạn tối đa 1.000.000 (ô K) ~ 1 tỷ VND mỗi lần rút

let user = null;
let balanceK = 0;

function toast(message) {
  const el = document.querySelector(".toast--center");
  if (!el) return alert(message);
  el.querySelector(".toast__text").textContent = message;
  el.hidden = false;
  el.classList.add("is-visible");
  clearTimeout(el._t);
  el._t = setTimeout(() => {
    el.classList.remove("is-visible");
    el.hidden = true;
  }, 2400);
}

async function init() {
  if (!sb) { toast("Supabase chưa cấu hình"); return; }
  const { data: { user: u } } = await sb.auth.getUser();
  if (!u) { window.location.href = "./index.html"; return; }
  user = u;
  const { data: profile } = await sb.from("profiles").select("balance_points").eq("id", u.id).maybeSingle();
  balanceK = Math.floor((profile?.balance_points || 0) / 1000);
  // VND row always shows BALANCE (giống cutoraclb — không update theo input)
  vndEl.textContent = fmt.format(balanceK) + "K";
}

// Input chỉ giữ số (số dư hiển thị riêng ở VND row, không update theo input)
amountInput.addEventListener("input", () => {
  amountInput.value = amountInput.value.replace(/\D/g, "");
});

// "Tất cả" — fill 100% balance (chỉ fill nếu > 0)
fillAllBtn.addEventListener("click", () => {
  if (balanceK > 0) amountInput.value = String(balanceK);
  else amountInput.value = "";
});

ruleLink.addEventListener("click", (e) => {
  e.preventDefault();
  ruleModal.showModal();
});

document.querySelectorAll("[data-close]").forEach((b) => {
  b.addEventListener("click", () => b.closest("dialog")?.close());
});

submitBtn.addEventListener("click", async () => {
  const k = Number(amountInput.value) || 0;
  if (k <= 0) { toast("Vui lòng điền số tiền chính xác"); return; }
  if (k < MIN_K) { toast(`Thấp nhất ${fmt.format(MIN_K)} điểm tương đương ${fmt.format(MIN_K)}K`); return; }
  if (k > MAX_K) { toast(`Tối đa ${fmt.format(MAX_K)}K mỗi lần rút`); return; }
  if (k > balanceK) { toast("Số dư không đủ"); return; }

  // Bank check — match cutoraclb redirect-to-bank flow
  const { data: banks } = await sb.from("bank_accounts").select("id").eq("user_id", user.id).limit(1);
  if (!banks?.length) {
    toast("Vui lòng đặt mật khẩu rút tiền của bạn");
    setTimeout(() => (window.location.href = "./link-bank.html"), 1500);
    return;
  }

  const ok = window.userConfirm
    ? await window.userConfirm(`Xác nhận rút ${fmt.format(k)}K?`, { title: "Rút tiền", okText: "Xác nhận" })
    : confirm(`Xác nhận rút ${fmt.format(k)}K?`);
  if (!ok) return;

  submitBtn.disabled = true;
  submitBtn.textContent = "Đang xử lý…";

  const points = k * 1000;
  // Atomic: trừ balance + insert pending tx (giống cutoraclb)
  const { error } = await sb.rpc("submit_withdraw_request", { p_amount: points });

  if (error) {
    submitBtn.disabled = false;
    submitBtn.textContent = "Rút tiền ngay lập tức";
    toast("Lỗi: " + error.message);
    return;
  }

  toast("Đã gửi yêu cầu rút thành công");
  // Sau success: reload page như cutoraclb (location.reload)
  setTimeout(() => location.reload(), 1500);
});

init();
