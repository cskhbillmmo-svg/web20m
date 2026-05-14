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

function showBankDetails(bank) {
  bankList.hidden = false;
  addCard.hidden = true;
  bankForm.hidden = true;
  document.querySelector("[data-bank-name]").textContent = bank.bank_name;
  document.querySelector("[data-bank-acc]").textContent = bank.account_number;
  document.querySelector("[data-bank-holder]").textContent = bank.account_holder;
}

function showAddCard() {
  bankList.hidden = true;
  addCard.hidden = false;
  bankForm.hidden = true;
}

function showForm() {
  bankList.hidden = true;
  addCard.hidden = true;
  bankForm.hidden = false;
}

async function loadBank() {
  if (!sb) return;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) { window.location.href = "./index.html"; return; }

  const { data, error } = await sb.from("bank_accounts")
    .select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1);
  if (error) { toast("Lỗi: " + error.message); return; }
  if (data?.length) showBankDetails(data[0]);
  else showAddCard();
}

addCard?.addEventListener("click", showForm);

document.querySelector("[data-cancel-bank-form]")?.addEventListener("click", loadBank);

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

loadBank();
