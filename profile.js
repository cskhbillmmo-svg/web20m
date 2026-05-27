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
// Hiá»ƒn thá»‹ balance theo K (1K = 1000 points/VND) + thousand separator
function setBalance(pointsValue) {
  currentBalance = pointsValue;
  const k = Math.floor((Number(pointsValue) || 0) / 1000);
  if (balanceEl) balanceEl.textContent = currency.format(k);
}

const actions = {
  "toggle-settings": () => toggleSettings(),

  "change-language": () => {
    closeSettings();
    showToast("Hiá»‡n chá»‰ há»— trá»£ Tiáº¿ng Viá»‡t");
  },

  "share-invite": () => {
    closeSettings();
    const inviteCode = currentProfile?.invite_code
      || (currentProfile?.username ? `KLG-${currentProfile.username}` : "KINGLOVE69-1102");
    const shareText = `Tham gia Kinglove69 cÃ¹ng tÃ´i! MÃ£ má»i: ${inviteCode}`;
    if (navigator.share) {
      navigator.share({ title: "Kinglove69", text: shareText }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard
        .writeText(shareText)
        .then(() => showToast(`ÄÃ£ sao chÃ©p mÃ£ má»i: ${inviteCode}`))
        .catch(() => showToast(`MÃ£ má»i: ${inviteCode}`));
    } else {
      showToast(`MÃ£ má»i: ${inviteCode}`);
    }
  },

  logout: async () => {
    closeSettings();
    const ok = window.userConfirm
      ? await window.userConfirm("Báº¡n cÃ³ cháº¯c muá»‘n Ä‘Äƒng xuáº¥t?", { title: "ÄÄƒng xuáº¥t", okText: "ÄÄƒng xuáº¥t", danger: true })
      : confirm("Báº¡n cÃ³ cháº¯c muá»‘n Ä‘Äƒng xuáº¥t?");
    if (!ok) return;
    await window.sb?.auth.signOut();
    window.location.href = "./index.html";
  },

  "online-support": () => showToast("Äang káº¿t ná»‘i CSKH trá»±c tuyáº¿nâ€¦"),

  "refresh-balance": async (btn) => {
    if (btn.classList.contains("is-spinning")) return;
    btn.classList.add("is-spinning");
    const fresh = await fetchProfile();
    if (fresh) setBalance(fresh.balance_points || 0);
    window.setTimeout(() => {
      btn.classList.remove("is-spinning");
      showToast(fresh ? "ÄÃ£ lÃ m má»›i sá»‘ dÆ°" : "KhÃ´ng thá»ƒ káº¿t ná»‘i server");
    }, 700);
  },

  "vote-history": () =>
    showCenterToast("Lá»‹ch sá»­ Vote sá»‘ Ä‘iá»ƒm bÃ­ máº­t, há»™i viÃªn khÃ´ng Ä‘Æ°á»£c cáº­p nháº­t vÃ o."),
  "bank-info": () => showToast("ThÃ´ng tin ngÃ¢n hÃ ng Ä‘ang Ä‘Æ°á»£c cáº­p nháº­t"),
  "notifications": () => showToast("Báº¡n chÆ°a cÃ³ thÃ´ng bÃ¡o má»›i"),
  "support": () => showToast("LiÃªn há»‡ há»— trá»£: support@cutora.vn"),

  "nav-home": () => showToast("Trang chá»§ Ä‘ang Ä‘Æ°á»£c phÃ¡t triá»ƒn"),
  "nav-vote": () => showToast("Trang VOTE Ä‘ang Ä‘Æ°á»£c phÃ¡t triá»ƒn"),
  "nav-cinema": () => showToast("Ráº¡p chiáº¿u Ä‘ang Ä‘Æ°á»£c phÃ¡t triá»ƒn"),
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
