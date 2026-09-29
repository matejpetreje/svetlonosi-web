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
      [3000, "Strážce plamene"],
      [6000, "Nositel světla"],
      [10000, "Věčný plamen"],
      [20000, "Maják Světlonošů"]
    ];

    let current = levels[0][1];

    for (const [threshold, name] of levels) {
      if (lifetime >= threshold) current = name;
      else break;
    }

    return current;
  }

  function formatDate(value) {
    if (!value) return "—";

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

  function showLocked() {
    $("publicProfileMessage").textContent = "";

    $("publicProfileCard").innerHTML = `
      <div class="spark-login-gate hall-login-gate">
        <div class="spark-login-gate-icon">✦</div>

        <div>
          <strong>Profily jsou dostupné po přihlášení.</strong>
          <span>
            Přihlas se přes KICK, aby zůstala Síň slávy
            a profily uvnitř komunity.
          </span>
        </div>

        <button
          class="btn primary"
          type="button"
          data-account-open
        >
          Přihlásit se přes KICK
        </button>
      </div>
    `;

    window.SVETLONOSI_ACCOUNT?.bindOpenButtons?.();
  }

  function cosmeticMap(rows) {
    const map = {};

    for (const row of rows || []) {
      map[row.slot_type] = row;
    }

    return map;
  }

  function badgeMarkup(badge) {
    if (!badge) {
      return "";
    }

    if (badge.preview_static_url) {
      return `
        <img
          class="public-profile-active-badge-image"
          src="${esc(badge.preview_static_url)}"
          alt="${esc(badge.variant_name)}"
        >
      `;
    }

    return `
      <span class="public-profile-active-badge spark-accent-${esc(badge.accent_key || "gold")}">
        ${esc(badge.preview_glyph || "✦")}
      </span>
    `;
  }

  function renderProfile(profile, equippedRows) {
    const card = $("publicProfileCard");
    const cosmetics = cosmeticMap(equippedRows);

    const name =
      profile.kick_display_name ||
      profile.kick_username ||
      "Světlonoš";

    const lifetime =
      Number(profile.lifetime_earned || 0);

    const level = levelFor(lifetime);

    const avatar =
      profile.kick_avatar_url
        ? `
          <img
            src="${esc(profile.kick_avatar_url)}"
            alt="${esc(name)}"
            referrerpolicy="no-referrer"
          >
        `
        : `<span>${esc(name.trim().charAt(0).toUpperCase() || "✦")}</span>`;

    const badge = cosmetics.badge;
    const frame = cosmetics.frame;
    const background = cosmetics.background;
    const effect = cosmetics.effect;

    card.className =
      `public-profile-card spark-profile-theme spark-accent-${esc(background?.accent_key || effect?.accent_key || "gold")}`;

    card.innerHTML = `
      <div class="public-profile-top">

        <div
          class="public-profile-avatar ${frame ? "has-frame" : ""} spark-accent-${esc(frame?.accent_key || "gold")}"
        >
          ${avatar}
          ${badge ? `<span class="profile-badge-overlay profile-badge-overlay-public" title="${esc(badge.variant_name || "Odznak")}">${badgeMarkup(badge)}</span>` : ""}
        </div>

        <div class="public-profile-identity">
          <div class="live-kicker">Veřejný profil</div>

          <div class="public-profile-name-row">
            <h1>${esc(name)}</h1>
          </div>

          <div class="public-profile-handle">
            @${esc(profile.kick_username || name)}
          </div>

          <div class="public-profile-title">
            ${esc(profile.profile_title || level)}
          </div>
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
          <span>Odznak</span>
          <strong>${esc(badge?.variant_name || "Zatím žádný")}</strong>
        </div>

        <div class="public-profile-cosmetic">
          <span>Rámeček</span>
          <strong>${esc(frame?.variant_name || "Základní")}</strong>
        </div>

        <div class="public-profile-cosmetic">
          <span>Efekt</span>
          <strong>${esc(effect?.variant_name || "Žádný")}</strong>
        </div>

        <div class="public-profile-cosmetic">
          <span>Pozadí</span>
          <strong>${esc(background?.variant_name || "Základní")}</strong>
        </div>
      </div>
    `;

    document.title =
      `${name} — Síň slávy Světlonošů`;
  }

  async function getDenseRank(lifetimeEarned) {
    const chunkSize = 100;
    let offset = 0;
    const pointValues = [];

    while (true) {
      const { data, error } =
        await db.rpc(
          "spark_hall_of_fame",
          {
            p_search: null,
            p_limit: chunkSize,
            p_offset: offset
          }
        );

      if (error) {
        throw error;
      }

      const chunk = data || [];

      for (const row of chunk) {
        pointValues.push(
          Number(row.lifetime_earned || 0)
        );
      }

      if (chunk.length < chunkSize) {
        break;
      }

      offset += chunkSize;

      if (offset >= 10000) {
        break;
      }
    }

    const uniqueDescending =
      [...new Set(pointValues)]
        .sort((a, b) => b - a);

    const index =
      uniqueDescending.indexOf(
        Number(lifetimeEarned || 0)
      );

    return index >= 0
      ? index + 1
      : null;
  }

  async function loadProfile() {
    const { data: sessionData } =
      await db.auth.getSession();

    if (!sessionData.session?.user) {
      showLocked();
      return;
    }

    const params =
      new URLSearchParams(window.location.search);

    const username =
      (params.get("u") || "").trim();

    if (!username) {
      $("publicProfileCard").innerHTML = "";
      $("publicProfileMessage").textContent =
        "V odkazu chybí KICK přezdívka.";
      return;
    }

    const [
      profileResult,
      cosmeticsResult
    ] =
      await Promise.all([
        db.rpc(
          "spark_public_profile",
          {
            p_username: username
          }
        ),

        db.rpc(
          "spark_profile_equipped",
          {
            p_username: username
          }
        )
      ]);

    if (profileResult.error) {
      console.error(profileResult.error);
      $("publicProfileCard").innerHTML = "";
      $("publicProfileMessage").textContent =
        "Profil se nepodařilo načíst: " +
        profileResult.error.message;
      return;
    }

    const profile =
      Array.isArray(profileResult.data)
        ? profileResult.data[0]
        : profileResult.data;

    if (!profile) {
      $("publicProfileCard").innerHTML = `
        <div class="public-profile-not-found">
          <div class="spark-emblem spark-emblem-sm"><span>✦</span></div>
          <h1>Profil nebyl nalezen</h1>
          <p>
            Tenhle Světlonoš zatím nemá veřejný profil
            nebo zadaná přezdívka neexistuje.
          </p>
          <a class="btn" href="../sin-slavy/">Zpět do Síně slávy</a>
        </div>
      `;
      return;
    }

    try {
      const denseRank =
        await getDenseRank(
          profile.lifetime_earned
        );

      if (denseRank != null) {
        profile.rank =
          denseRank;
      }
    } catch (rankError) {
      console.warn(
        "Dense rank se nepodařilo dopočítat:",
        rankError
      );
    }

    renderProfile(
      profile,
      cosmeticsResult.error
        ? []
        : cosmeticsResult.data
    );
  }

  window.addEventListener(
    "svetlonosi-account-changed",
    event => {
      if (!event.detail?.session?.user) {
        showLocked();
        return;
      }

      loadProfile();
    }
  );

  loadProfile();

})();
