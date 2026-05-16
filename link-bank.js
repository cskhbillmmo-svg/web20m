const sb = window.sb;

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
  }, 2200);
}

const bankList = document.querySelector("[data-bank-list]");
const addCard = document.querySelector("[data-no-bank]");
const bankForm = document.querySelector("[data-bank-form]");
let currentUserId = null;

function setState(state, bank) {
  // HAS_BANK: readonly view, no add/form
  // NO_BANK: show + button only
  // ADDING: show form only
  bankList.hidden = state !== "HAS_BANK";
  addCard.hidden = state !== "NO_BANK";
  bankForm.hidden = state !== "ADDING";

  if (state === "HAS_BANK" && bank) {
    document.querySelector("[data-bank-name]").textContent = bank.bank_name;
    document.querySelector("[data-bank-acc]").textContent = bank.account_number;
    document.querySelector("[data-bank-holder]").textContent = bank.account_holder;
  }
}

async function loadBank() {
  if (!sb) return;
  if (!currentUserId) {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { window.location.href = "./index.html"; return; }
    currentUserId = user.id;
  }

  const { data, error } = await sb.from("bank_accounts")
    .select("*").eq("user_id", currentUserId).order("created_at", { ascending: false }).limit(1);
  if (error) { toast("Lỗi: " + error.message); return; }
  if (data?.length) setState("HAS_BANK", data[0]);
  else setState("NO_BANK");
}

async function initBankPage() {
  await loadBank();
  window.addEventListener("focus", () => {
    if (bankForm.hidden) loadBank();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && bankForm.hidden) loadBank();
  });
  if (currentUserId && sb?.channel) {
    sb.channel(`bank-account-${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bank_accounts", filter: `user_id=eq.${currentUserId}` },
        () => loadBank()
      )
      .subscribe();
  }
}

addCard?.addEventListener("click", () => setState("ADDING"));

document.querySelector("[data-cancel-bank-form]")?.addEventListener("click", () => setState("NO_BANK"));

bankForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(bankForm);
  const bankName = String(fd.get("bank_name") || "").trim();
  const accountNumber = String(fd.get("account_number") || "").trim();
  const accountHolder = String(fd.get("account_holder") || "").trim().toUpperCase();

  if (!bankName || !accountNumber || !accountHolder) {
    toast("Vui lòng điền đủ thông tin");
    return;
  }
  if (!/^\d{6,}$/.test(accountNumber)) {
    toast("Số tài khoản không hợp lệ");
    return;
  }

  const { data: { user } } = await sb.auth.getUser();

  // Double-check: chỉ cho insert nếu user chưa có bank
  const { data: existing } = await sb.from("bank_accounts")
    .select("id").eq("user_id", user.id).limit(1);
  if (existing?.length) {
    toast("Bạn đã liên kết tài khoản ngân hàng. Liên hệ CSKH để chỉnh sửa.");
    loadBank();
    return;
  }

  const { error } = await sb.from("bank_accounts").insert({
    user_id: user.id,
    bank_name: bankName,
    account_number: accountNumber,
    account_holder: accountHolder,
    is_primary: true,
  });
  if (error) { toast("Lỗi: " + error.message); return; }
  toast("Đã liên kết tài khoản ngân hàng");
  loadBank();
});

initBankPage();
