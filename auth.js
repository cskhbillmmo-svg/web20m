const sb = window.sb;

function syntheticEmail(username) {
  return `${username.trim().toLowerCase()}@onenight.com`;
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
    toast("Supabase chưa được cấu hình");
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
      toast("Vui lòng nhập tên đăng ký và mật khẩu");
      return;
    }
    const { data, error } = await sb.auth.signInWithPassword({
      email: syntheticEmail(username),
      password,
    });
    if (error) {
      toast("Đăng nhập thất bại: " + error.message);
      return;
    }
    // Redirect admin to admin panel, members to profile
    const { data: p } = await sb.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
    window.location.href = p?.role === "admin" ? "./admin.html" : "./profile.html";
  });
}

// ===== REGISTER form (register.html) — has invite_code field =====
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
      toast("Vui lòng điền đủ thông tin");
      return;
    }
    if (!inviteCode) {
      toast("Mã mời là bắt buộc");
      return;
    }
    if (password.length < 6) {
      toast("Mật khẩu phải có ít nhất 6 ký tự");
      return;
    }
    if (password !== confirm) {
      toast("Mật khẩu xác nhận không khớp");
      return;
    }

    const { data: validCode, error: codeError } = await sb.from("invite_codes")
      .select("code")
      .eq("code", inviteCode)
      .eq("status", "active")
      .maybeSingle();
    if (codeError) {
      toast("Kiểm tra mã mời thất bại: " + codeError.message);
      return;
    }
    if (!validCode) {
      toast("Mã mời không hợp lệ hoặc đã bị vô hiệu hóa");
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
      toast("Đăng ký thất bại: " + error.message);
      return;
    }
    toast("Đăng ký thành công, đang chuyển sang đăng nhập…");
    setTimeout(() => (window.location.href = "./index.html"), 1500);
  });
}

// ===== FORGOT PASSWORD form (forgot-password.html) — has otp field =====
const forgotForm = document.querySelector('form input[name="otp"]')?.closest("form");
if (forgotForm) {
  forgotForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!requireSb()) return;
    const username = forgotForm.querySelector('input[name="username"]').value.trim();
    const newPassword = forgotForm.querySelector('input[name="new_password"]').value;
    const confirm = forgotForm.querySelector('input[name="new_password_confirm"]').value;

    if (!username || !newPassword) {
      toast("Vui lòng điền đủ thông tin");
      return;
    }
    if (newPassword !== confirm) {
      toast("Mật khẩu xác nhận không khớp");
      return;
    }
    // Stub: a real reset flow needs OTP verification. For demo, send a reset email.
    const { error } = await sb.auth.resetPasswordForEmail(syntheticEmail(username), {
      redirectTo: window.location.origin + "/index.html",
    });
    if (error) {
      toast("Gửi yêu cầu thất bại: " + error.message);
      return;
    }
    toast("Đã gửi yêu cầu đặt lại mật khẩu");
  });

  // "Gửi mã" button
  const sendOtpBtn = forgotForm.querySelector(".field-action");
  if (sendOtpBtn) {
    sendOtpBtn.addEventListener("click", async () => {
      if (!requireSb()) return;
      const username = forgotForm.querySelector('input[name="username"]').value.trim();
      if (!username) {
        toast("Nhập tên đăng ký trước");
        return;
      }
      const { error } = await sb.auth.signInWithOtp({
        email: syntheticEmail(username),
      });
      if (error) {
        toast("Gửi mã thất bại: " + error.message);
        return;
      }
      toast("Đã gửi mã (kiểm tra email)");
    });
  }
}
