(() => {
  const cfg = window.SVETLONOSI_CONFIG;

  if (!cfg || !window.supabase) {
    return;
  }

  const db = supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_ANON_KEY
  );

  const $ = id => document.getElementById(id);

  const esc = value =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const format = value =>
    Number(value ?? 0).toLocaleString("cs-CZ");

  function levelFor(lifetime) {
    const levels = [
      [0, "Zbloudilá jiskra"],
      [100, "Jiskra"],
      [300, "Plamínek"],
      [750, "Pochodeň"],
      [1500, "Světlonoš"],
      [3000, "Strážce světla"],
      [6000, "Nositel plamene"],
      [10000, "Věčný plamen"],
      [20000, "Maják Světlonošů"]
    ];

    let current = levels[0][1];

    for (const [threshold, name] of levels) {
      if (lifetime >= threshold) {
        current = name;
      } else {
        break;
      }
    }

    return current;
  }

  function formatDate(value) {
    if (!value) {
      return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return date.toLocaleDateString("cs-CZ", {
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  }

  function renderProfile(profile) {
    const card = $("publicProfileCard");
    const name = profile.kick_display_name || profile.kick_username || "Světlonoš";
    const lifetime = Number(profile.lifetime_earned || 0);
    const level = levelFor(lifetime);

    const avatar = profile.kick_avatar_url
      ? `
          <img
            src="${esc(profile.kick_avatar_url)}"
            alt="${esc(name)}"
            referrerpolicy="no-referrer"
          >
        `
      : `<span>${esc(name.trim().charAt(0).toUpperCase() || "✦")}</span>`;

    card.innerHTML = `
      <div class="public-profile-top">
        <div class="public-profile-avatar ${profile.active_frame ? "has-frame" : ""}">
          ${avatar}
        </div>

        <div class="public-profile-identity">
          <div class="live-kicker">Veřejný profil</div>
          <h1>${esc(name)}</h1>
          <div class="public-profile-handle">@${esc(profile.kick_username || name)}</div>
          <div class="public-profile-title">${esc(profile.profile_title || level)}</div>
        </div>

        <div class="public-profile-rank">
          <span>Pořadí</span>
          <strong>#${format(profile.rank)}</strong>
        </div>
      </div>

      <div class="public-profile-stats">
        <div>
          <span>Celkem získáno</span>
          <strong>${format(lifetime)} ✦</strong>
        </div>

        <div>
          <span>Hodnost</span>
          <strong>${esc(level)}</strong>
        </div>

        <div>
          <span>Světlonošem od</span>
          <strong>${esc(formatDate(profile.member_since))}</strong>
        </div>
      </div>

      <div class="public-profile-cosmetics">
        <div class="public-profile-cosmetic">
          <span>Aktivní titul</span>
          <strong>${esc(profile.profile_title || "Zatím žádný")}</strong>
        </div>

        <div class="public-profile-cosmetic">
          <span>Odznak</span>
          <strong>${esc(profile.active_badge || "Zatím žádný")}</strong>
        </div>

        <div class="public-profile-cosmetic">
          <span>Rámeček</span>
          <strong>${esc(profile.active_frame || "Základní")}</strong>
        </div>
      </div>
    `;

    document.title = `${name} — Síň slávy Světlonošů`;
  }

  async function loadProfile() {
    const message = $("publicProfileMessage");
    const card = $("publicProfileCard");
    const params = new URLSearchParams(window.location.search);
    const username = (params.get("u") || "").trim();

    if (!username) {
      card.innerHTML = "";
      message.textContent = "V odkazu chybí KICK přezdívka.";
      return;
    }

    const { data, error } = await db.rpc(
      "spark_public_profile",
      {
        p_username: username
      }
    );

    if (error) {
      console.error(error);
      card.innerHTML = "";
      message.textContent = `Profil se nepodařilo načíst: ${error.message}`;
      return;
    }

    const profile = Array.isArray(data)
      ? data[0]
      : data;

    if (!profile) {
      card.innerHTML = `
        <div class="public-profile-not-found">
          <div class="spark-emblem spark-emblem-sm"><span>✦</span></div>
          <h1>Profil nebyl nalezen</h1>
          <p>Tenhle Světlonoš zatím nemá veřejný profil nebo zadaná přezdívka neexistuje.</p>
          <a class="btn" href="../sin-slavy/">Zpět do Síně slávy</a>
        </div>
      `;
      return;
    }

    renderProfile(profile);
  }

  loadProfile();
})();
