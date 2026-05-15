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

  const h1 = document.querySelector(".profile-ident h1");
  const sub = document.querySelector(".profile-ident p");
  const balanceEl = document.querySelector("[data-balance]");

  // Display balance in K (1K = 1000 VND/points)
  function toK(points) {
    return String(Math.floor((Number(points) || 0) / 1000));
  }

  function applyProfile(p) {
    if (!p) return;
    if (h1) h1.textContent = p.display_name || p.username || user.email.split("@")[0];
    if (balanceEl) balanceEl.textContent = toK(p.balance_points);
  }

  const profile = await window.fetchProfile();
  if (profile) applyProfile(profile);
  else if (h1) h1.textContent = user.email.split("@")[0];
  if (sub) sub.textContent = user.email;

  // Realtime: balance change → cập nhật ngay không cần refresh
  sb.channel(`profile-${user.id}`)
    .on("postgres_changes",
      { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
      (payload) => {
        if (balanceEl) {
          const oldK = Number(balanceEl.textContent.replace(/\D/g, "")) || 0;
          const nextK = Math.floor((Number(payload.new.balance_points) || 0) / 1000);
          balanceEl.textContent = String(nextK);
          if (nextK !== oldK) {
            balanceEl.classList.add("balance-flash");
            setTimeout(() => balanceEl.classList.remove("balance-flash"), 800);
          }
        }
      }
    )
    .subscribe();
})();
