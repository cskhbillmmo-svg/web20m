const currency = new Intl.NumberFormat("vi-VN");

const toastEl = document.querySelector(".toast:not(.toast--center)");
let toastTimer = 0;
function showToast(message) {
  if (!toastEl) {
    alert(message);
    return;
  }
  toastEl.textContent = message;
  toastEl.hidden = false;
  requestAnimationFrame(() => toastEl.classList.add("is-visible"));
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastEl.classList.remove("is-visible");
    toastEl.addEventListener("transitionend", () => (toastEl.hidden = true), { once: true });
  }, 2000);
}

const centerToastEl = document.querySelector(".toast--center");
const centerToastIcon = centerToastEl?.querySelector(".toast__icon");
const centerToastText = centerToastEl?.querySelector(".toast__text");
let centerToastTimer = 0;
function showCenterToast(message, icon = "") {
  if (!centerToastEl) {
    showToast(message);
    return;
  }
  centerToastText.textContent = message;
  if (icon) {
    centerToastIcon.textContent = icon;
    centerToastIcon.hidden = false;
  } else {
    centerToastIcon.hidden = true;
  }
  centerToastEl.hidden = false;
  requestAnimationFrame(() => centerToastEl.classList.add("is-visible"));
  clearTimeout(centerToastTimer);
  centerToastTimer = window.setTimeout(() => {
    centerToastEl.classList.remove("is-visible");
    centerToastEl.addEventListener("transitionend", () => (centerToastEl.hidden = true), { once: true });
  }, 2500);
}

const settingsBtn = document.querySelector("[data-action='toggle-settings']");
const settingsMenu = document.querySelector(".settings-menu");
function closeSettings() {
  if (!settingsMenu || settingsMenu.hidden) return;
  settingsMenu.hidden = true;
  settingsBtn?.setAttribute("aria-expanded", "false");
}
function toggleSettings() {
  if (!settingsMenu) return;
  const next = settingsMenu.hidden;
  settingsMenu.hidden = !next;
  settingsBtn?.setAttribute("aria-expanded", String(next));
}

document.addEventListener("click", (e) => {
  if (
    settingsMenu &&
    !settingsMenu.hidden &&
    !settingsMenu.contains(e.target) &&
    !settingsBtn?.contains(e.target)
  ) {
    closeSettings();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeSettings();
});

const balanceEl = document.querySelector("[data-balance]");
let currentBalance = Number(balanceEl?.textContent || 0);
// Hiển thị balance theo K (1K = 1000 points/VND) + thousand separator
function setBalance(pointsValue) {
  currentBalance = pointsValue;
  const k = Math.floor((Number(pointsValue) || 0) / 1000);
  if (balanceEl) balanceEl.textContent = currency.format(k);
}

const actions = {
  "toggle-settings": () => toggleSettings(),

  "change-language": () => {
    closeSettings();
    showToast("Hiện chỉ hỗ trợ Tiếng Việt");
  },

  "share-invite": () => {
    closeSettings();
    const inviteCode = currentProfile?.invite_code
      || (currentProfile?.username ? `KLG-${currentProfile.username}` : "KINGLOVE69-1102");
    const shareText = `Tham gia Kinglove69 cùng tôi! Mã mời: ${inviteCode}`;
    if (navigator.share) {
      navigator.share({ title: "Kinglove69", text: shareText }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard
        .writeText(shareText)
        .then(() => showToast(`Đã sao chép mã mời: ${inviteCode}`))
        .catch(() => showToast(`Mã mời: ${inviteCode}`));
    } else {
      showToast(`Mã mời: ${inviteCode}`);
    }
  },

  logout: async () => {
    closeSettings();
    const ok = window.userConfirm
      ? await window.userConfirm("Bạn có chắc muốn đăng xuất?", { title: "Đăng xuất", okText: "Đăng xuất", danger: true })
      : confirm("Bạn có chắc muốn đăng xuất?");
    if (!ok) return;
    await window.sb?.auth.signOut();
    window.location.href = "./index.html";
  },

  "online-support": () => showToast("Đang kết nối CSKH trực tuyến…"),

  "refresh-balance": async (btn) => {
    if (btn.classList.contains("is-spinning")) return;
    btn.classList.add("is-spinning");
    const fresh = await fetchProfile();
    if (fresh) setBalance(fresh.balance_points || 0);
    window.setTimeout(() => {
      btn.classList.remove("is-spinning");
      showToast(fresh ? "Đã làm mới số dư" : "Không thể kết nối server");
    }, 700);
  },

  "vote-history": () =>
    showCenterToast("Lịch sử Vote số điểm bí mật, hội viên không được cập nhật vào."),
  "bank-info": () => showToast("Thông tin ngân hàng đang được cập nhật"),
  "notifications": () => showToast("Bạn chưa có thông báo mới"),
  "support": () => showToast("Liên hệ hỗ trợ: support@cutora.vn"),

  "nav-home": () => showToast("Trang chủ đang được phát triển"),
  "nav-vote": () => showToast("Trang VOTE đang được phát triển"),
  "nav-cinema": () => showToast("Rạp chiếu đang được phát triển"),
};

document.addEventListener("click", (e) => {
  const trigger = e.target.closest("[data-action]");
  if (!trigger) return;
  const name = trigger.dataset.action;
  const handler = actions[name];
  if (handler) handler(trigger, e);
});

// ===== Live profile data from Supabase =====
let currentProfile = null;

async function fetchProfile() {
  if (!window.sb) return null;
  const { data: { user } } = await window.sb.auth.getUser();
  if (!user) return null;
  const { data, error } = await window.sb
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (error) {
    console.warn("[profile] load error", error);
    return null;
  }
  currentProfile = data ? { ...data, email: user.email, auth_id: user.id } : null;
  return currentProfile;
}

async function renderProfile() {
  const profile = await fetchProfile();
  if (!profile) {
    if (window.sb) window.location.href = "./index.html";
    return;
  }
  const nameEl = document.querySelector(".profile-ident h1");
  const idEl = document.querySelector(".profile-ident p");
  if (nameEl) nameEl.textContent = profile.display_name || profile.username || "User";
  if (idEl) idEl.textContent = profile.auth_id;
  setBalance(profile.balance_points || 0);
}

renderProfile();
