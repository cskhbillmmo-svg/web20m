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

(async function init() {
  if (!sb) return;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) { window.location.href = "./index.html"; return; }
})();

document.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-action]");
  if (!t) return;
  const a = t.dataset.action;

  if (a === "logout") {
    const ok = window.userConfirm
      ? await window.userConfirm("Bạn có chắc muốn đăng xuất?", { title: "Đăng xuất", okText: "Đăng xuất", danger: true })
      : confirm("Bạn có chắc muốn đăng xuất?");
    if (!ok) return;
    if (sb) await sb.auth.signOut();
    window.location.href = "./index.html";
    return;
  }

  if (a === "language") {
    toast("Hiện chỉ hỗ trợ Tiếng Việt");
    return;
  }

  if (a === "fund-password") {
    toast("Mật khẩu rút tiền chỉ đổi qua CSKH sau khi đã thiết lập");
    return;
  }
});
