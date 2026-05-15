// Shared user-side confirm/prompt modal (light theme, matches profile.css)
// Returns Promise<boolean | string>. false = cancel; true / string = ok.
window.userConfirm = function (message, options = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "uc-overlay";
    overlay.innerHTML = `
      <div class="uc-box" role="dialog" aria-modal="true">
        ${options.title ? `<h3 class="uc-title">${escUC(options.title)}</h3>` : ""}
        <p class="uc-msg">${escUC(message)}</p>
        ${options.input ? `<textarea class="uc-input" rows="2" placeholder="${escUC(options.placeholder || "")}">${escUC(options.defaultValue || "")}</textarea>` : ""}
        <div class="uc-actions">
          <button type="button" class="uc-btn uc-cancel">${escUC(options.cancelText || "Hủy")}</button>
          <button type="button" class="uc-btn uc-ok${options.danger ? " uc-danger" : ""}">${escUC(options.okText || "Xác nhận")}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector(".uc-input");
    const okBtn = overlay.querySelector(".uc-ok");
    const cancelBtn = overlay.querySelector(".uc-cancel");

    const cleanup = (result) => {
      overlay.remove();
      document.removeEventListener("keydown", onKey);
      resolve(result);
    };

    okBtn.addEventListener("click", () => {
      if (options.input) cleanup(input.value.trim() || true);
      else cleanup(true);
    });
    cancelBtn.addEventListener("click", () => cleanup(false));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) cleanup(false);
    });

    function onKey(e) {
      if (e.key === "Escape") cleanup(false);
      else if (e.key === "Enter" && !options.input) cleanup(true);
    }
    document.addEventListener("keydown", onKey);

    requestAnimationFrame(() => overlay.classList.add("is-visible"));
    if (input) setTimeout(() => input.focus(), 50);
  });
};

window.userPrompt = function (message, defaultValue = "", options = {}) {
  return window.userConfirm(message, { ...options, input: true, defaultValue });
};

function escUC(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
