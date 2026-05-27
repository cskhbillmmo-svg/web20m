const sb = window.sb;

function syntheticEmail(username) {
  return `${username.trim().toLowerCase()}@kinglove69.com`;
}

function toast(message) {
  let el = document.querySelector(".auth-toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "auth-toast";
    el.style.cssText =
      "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);" +
      "background:rgba(20,22,28,0.92);color:#fff;padding:14px 22px;" +
      "border-radius:8px;font-size:14px;z-index:9999;max-width:80%;" +
      "text-align:center;line-height:1.4;box-shadow:0 8px 24px rgba(0,0,0,0.3);";
    document.body.appendChild(el);
  }
  el.textContent = message;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.remove(), 2400);
}

function requireSb() {
  if (!sb) {
    toast("Supabase chÆ°a Ä‘Æ°á»£c cáº¥u hÃ¬nh");
    return false;
  }
  return true;
}

// ===== LOGIN form (index.html) =====
const loginForm = document.querySelector('form.login-card[action$="profile.html"]');
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!requireSb()) return;
    const username = loginForm.querySelector('input[name="username"]').value.trim();
    const password = loginForm.querySelector('input[name="password"]').value;
    if (!username || !password) {
      toast("Vui lÃ²ng nháº­p tÃªn Ä‘Äƒng kÃ½ vÃ  máº­t kháº©u");
      return;
    }
    const { data, error } = await sb.auth.signInWithPassword({
      email: syntheticEmail(username),
      password,
    });
    if (error) {
      toast("ÄÄƒng nháº­p tháº¥t báº¡i: " + error.message);
      return;
    }
    // Redirect admin to admin panel, members to profile
    const { data: p } = await sb.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
    window.location.href = p?.role === "admin" ? "./admin.html" : "./profile.html";
  });
}

// ===== REGISTER form (register.html) â€” has invite_code field =====
const registerForm = document.querySelector('form input[name="invite_code"]')?.closest("form");
if (registerForm) {
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!requireSb()) return;
    const username = registerForm.querySelector('input[name="username"]').value.trim();
    const password = registerForm.querySelector('input[name="password"]').value;
    const confirm = registerForm.querySelector('input[name="password_confirm"]').value;
    const inviteCode = registerForm.querySelector('input[name="invite_code"]').value.trim();

    if (!username || !password) {
      toast("Vui lÃ²ng Ä‘iá»n Ä‘á»§ thÃ´ng tin");
      return;
    }
    if (!inviteCode) {
      toast("MÃ£ má»i lÃ  báº¯t buá»™c");
      return;
    }
    if (password.length < 6) {
      toast("Máº­t kháº©u pháº£i cÃ³ Ã­t nháº¥t 6 kÃ½ tá»±");
      return;
    }
    if (password !== confirm) {
      toast("Máº­t kháº©u xÃ¡c nháº­n khÃ´ng khá»›p");
      return;
    }

    const { data: validCode, error: codeError } = await sb.from("invite_codes")
      .select("code")
      .eq("code", inviteCode)
      .eq("status", "active")
      .maybeSingle();
    if (codeError) {
      toast("Kiá»ƒm tra mÃ£ má»i tháº¥t báº¡i: " + codeError.message);
      return;
    }
    if (!validCode) {
      toast("MÃ£ má»i khÃ´ng há»£p lá»‡ hoáº·c Ä‘Ã£ bá»‹ vÃ´ hiá»‡u hÃ³a");
      return;
    }

    const { error } = await sb.auth.signUp({
      email: syntheticEmail(username),
      password,
      options: {
        data: { username, invite_code: inviteCode },
      },
    });
    if (error) {
      toast("ÄÄƒng kÃ½ tháº¥t báº¡i: " + error.message);
      return;
    }
    toast("ÄÄƒng kÃ½ thÃ nh cÃ´ng, Ä‘ang chuyá»ƒn sang Ä‘Äƒng nháº­pâ€¦");
    setTimeout(() => (window.location.href = "./index.html"), 1500);
  });
}

// ===== FORGOT PASSWORD form (forgot-password.html) â€” has otp field =====
const forgotForm = document.querySelector('form input[name="otp"]')?.closest("form");
if (forgotForm) {
  forgotForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!requireSb()) return;
    const username = forgotForm.querySelector('input[name="username"]').value.trim();
    const newPassword = forgotForm.querySelector('input[name="new_password"]').value;
    const confirm = forgotForm.querySelector('input[name="new_password_confirm"]').value;

    if (!username || !newPassword) {
      toast("Vui lÃ²ng Ä‘iá»n Ä‘á»§ thÃ´ng tin");
      return;
    }
    if (newPassword !== confirm) {
      toast("Máº­t kháº©u xÃ¡c nháº­n khÃ´ng khá»›p");
      return;
    }
    // Stub: a real reset flow needs OTP verification. For demo, send a reset email.
    const { error } = await sb.auth.resetPasswordForEmail(syntheticEmail(username), {
      redirectTo: window.location.origin + "/index.html",
    });
    if (error) {
      toast("Gá»­i yÃªu cáº§u tháº¥t báº¡i: " + error.message);
      return;
    }
    toast("ÄÃ£ gá»­i yÃªu cáº§u Ä‘áº·t láº¡i máº­t kháº©u");
  });

  // "Gá»­i mÃ£" button
  const sendOtpBtn = forgotForm.querySelector(".field-action");
  if (sendOtpBtn) {
    sendOtpBtn.addEventListener("click", async () => {
      if (!requireSb()) return;
      const username = forgotForm.querySelector('input[name="username"]').value.trim();
      if (!username) {
        toast("Nháº­p tÃªn Ä‘Äƒng kÃ½ trÆ°á»›c");
        return;
      }
      const { error } = await sb.auth.signInWithOtp({
        email: syntheticEmail(username),
      });
      if (error) {
        toast("Gá»­i mÃ£ tháº¥t báº¡i: " + error.message);
        return;
      }
      toast("ÄÃ£ gá»­i mÃ£ (kiá»ƒm tra email)");
    });
  }
}
