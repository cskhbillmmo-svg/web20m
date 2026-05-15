const sb = window.sb;
const optionButtons = document.querySelectorAll(".option-card");
const selectedText = document.querySelector("[data-selected-text]");
const amountInput = document.querySelector("[data-amount]");
const totalBets = document.querySelector("[data-total-bets]");
const totalAmount = document.querySelector("[data-total-amount]");
const confirmButton = document.querySelector("[data-confirm]");
const toastEl = document.querySelector(".toast");
const betPanel = document.querySelector(".bet-panel");
const balanceEl = document.querySelector("[data-balance]");
const titleEl = document.querySelector(".top-nav h1");

let selected = [];
let toastTimer = 0;
let voteType = 1;
let openRound = null;
let userBalance = 0;
let user = null;

function showToast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), 2000);
}

function updateTotals() {
  const amount = Number(amountInput.value || 0);
  const count = selected.length;
  totalBets.textContent = String(count);
  totalAmount.textContent = count ? String(amount * count) : "0";
  betPanel.hidden = count === 0;
}

const fmtBalance = new Intl.NumberFormat("vi-VN");
function setBalance(n) {
  userBalance = n;
  if (balanceEl) balanceEl.firstChild.textContent = fmtBalance.format(Math.floor(n / 1000));
}

// ===== Init =====
(async function init() {
  voteType = Number(new URLSearchParams(location.search).get("id")) || 1;
  if (titleEl) titleEl.textContent = "VOTE" + voteType;

  if (!sb) return;

  const { data: { user: u } } = await sb.auth.getUser();
  if (!u) { window.location.href = "./index.html"; return; }
  user = u;

  const { data: profile } = await sb.from("profiles")
    .select("balance_points").eq("id", u.id).maybeSingle();
  if (profile) setBalance(profile.balance_points || 0);

  const { data: round } = await sb.from("vote_rounds")
    .select("*").eq("vote_type", voteType).eq("status", "open")
    .order("open_at", { ascending: false }).limit(1).maybeSingle();

  if (!round) {
    showToast("Hiện chưa có round nào đang mở cho VOTE" + voteType);
    // Không disable — vẫn cho user toggle option, chỉ chặn submit
    return;
  }
  openRound = round;
  if (titleEl) titleEl.textContent = `VOTE${voteType} · ${round.round_no}`;

  // Update odds display from round multiplier
  optionButtons.forEach((b) => {
    const oddEl = b.querySelector("span");
    if (oddEl) oddEl.textContent = round.multiplier;
  });
})();

async function refetchBalance() {
  if (!user) return;
  const { data: profile } = await sb.from("profiles")
    .select("balance_points").eq("id", user.id).maybeSingle();
  if (profile) setBalance(profile.balance_points || 0);
}

optionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const choice = button.dataset.choice;
    const alreadySelected = selected.includes(choice);
    button.classList.toggle("is-selected", !alreadySelected);
    selected = alreadySelected ? selected.filter((i) => i !== choice) : [...selected, choice];
    if (selected.length) {
      selectedText.textContent = selected.join(",");
    } else {
      selectedText.textContent = "Không được chọn";
      amountInput.value = "";
    }
    updateTotals();
  });
});

amountInput.addEventListener("input", () => {
  amountInput.value = amountInput.value.replace(/\D/g, "");
  updateTotals();
});

confirmButton.addEventListener("click", async () => {
  // Validation order chuẩn cutoraclb (reservation.*)
  const moneyStr = amountInput.value.trim();
  if (moneyStr === "0") { showToast("Số tiền sai"); return; }
  if (!selected.length) { showToast("Vui lòng chọn"); return; }
  if (moneyStr === "") { showToast("Vui lòng nhập số tiền"); return; }

  const amountK = Number(moneyStr);
  const amountPoints = amountK * 1000;
  const totalNeeded = amountPoints * selected.length;

  if (totalNeeded > userBalance) {
    showToast("Số dư không đủ, vui lòng liên hệ CSKH để nạp thêm!");
    return;
  }

  confirmButton.disabled = true;
  let placedCount = 0;
  let lastError = null;
  for (const choice of selected) {
    // quick_place_bet tự tạo round nếu chưa có + atomic trừ balance
    const { error } = await sb.rpc("quick_place_bet", {
      p_vote_type: voteType,
      p_choice: choice,
      p_amount: amountPoints,
    });
    if (error) { lastError = error; break; }
    placedCount++;
  }
  confirmButton.disabled = false;

  if (lastError) {
    showToast("Lỗi: " + lastError.message);
    await refetchBalance();
  } else {
    showToast(`Đã đặt cược ${placedCount} lần · ${(totalNeeded/1000).toLocaleString("vi-VN")}K`);
    // allClear() — reset form như cutoraclb
    selected = [];
    optionButtons.forEach((b) => b.classList.remove("is-selected"));
    selectedText.textContent = "Không được chọn";
    amountInput.value = "";
    updateTotals();
    await refetchBalance();
  }
});
