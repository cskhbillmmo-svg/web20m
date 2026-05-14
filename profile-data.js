window.fetchProfile = async function () {
  const sb = window.sb;
  if (!sb) return null;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data, error } = await sb
    .from("profiles")
    .select("username, display_name, balance_points, vote_points, advance_points, auto_points, kid_points")
    .eq("id", user.id)
    .single();
  if (error) {
    console.warn("[fetchProfile]", error.message);
    return null;
  }
  return { user, ...data };
};

(async () => {
  const sb = window.sb;
  if (!sb) return;

  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    window.location.href = "./index.html";
    return;
  }

  const profile = await window.fetchProfile();
  const h1 = document.querySelector(".profile-ident h1");
  const sub = document.querySelector(".profile-ident p");
  const balanceEl = document.querySelector("[data-balance]");

  if (profile) {
    if (h1) h1.textContent = profile.display_name || profile.username || user.email.split("@")[0];
    if (balanceEl) balanceEl.textContent = String(profile.balance_points || 0);
  } else if (h1) {
    h1.textContent = user.email.split("@")[0];
  }
  if (sub) sub.textContent = user.email;
})();
