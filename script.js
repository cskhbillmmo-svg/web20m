document.querySelectorAll("[data-toggle-password]").forEach((toggleButton) => {
  const targetId = toggleButton.dataset.togglePassword;
  const passwordInput = targetId
    ? document.getElementById(targetId)
    : toggleButton.parentElement.querySelector("input");

  if (!passwordInput) return;

  toggleButton.addEventListener("click", () => {
    const isHidden = passwordInput.type === "password";
    passwordInput.type = isHidden ? "text" : "password";
    toggleButton.classList.toggle("is-visible", isHidden);
    toggleButton.setAttribute("aria-label", isHidden ? "Ẩn mật khẩu" : "Hiện mật khẩu");
  });
});
