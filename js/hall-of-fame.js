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

  function avatarMarkup(row) {
    const name = row.kick_display_name || row.kick_username || "Světlonoš";

    if (row.kick_avatar_url) {
      return `
        <img
          src="${esc(row.kick_avatar_url)}"
          alt="${esc(name)}"
          referrerpolicy="no-referrer"
        >
      `;
    }

    return `<span>${esc(name.trim().charAt(0).toUpperCase() || "✦")}</span>`;
  }

  function renderRows(rows) {
    const board = $("hallBoard");

    if (!rows?.length) {
      board.innerHTML = `
        <div class="hall-empty">
          Nikdo s touto přezdívkou zatím v Síni slávy není.
        </div>
      `;
      return;
    }

    board.innerHTML = `
      <div class="hall-board-head">
        <span>#</span>
        <span>Světlonoš</span>
        <span>Hodnost</span>
        <span>Celkem Jisker</span>
      </div>

      ${rows.map(row => {
        const name = row.kick_display_name || row.kick_username || "Světlonoš";
        const lifetime = Number(row.lifetime_earned || 0);
        const profileUrl = `../profil/?u=${encodeURIComponent(row.kick_username || "")}`;

        return `
          <a class="hall-row" href="${profileUrl}">
            <div class="hall-rank hall-rank-${Number(row.rank) <= 3 ? Number(row.rank) : "other"}">
              ${format(row.rank)}
            </div>

            <div class="hall-user">
              <div class="hall-avatar">
                ${avatarMarkup(row)}
              </div>

              <div class="hall-user-copy">
                <strong>${esc(name)}</strong>
                <span>@${esc(row.kick_username || name)}</span>
              </div>
            </div>

            <div class="hall-level">
              ${esc(row.profile_title || levelFor(lifetime))}
            </div>

            <div class="hall-lifetime">
              ${format(lifetime)} <span>✦</span>
            </div>
          </a>
        `;
      }).join("")}
    `;
  }

  async function loadHall(search = "") {
    const message = $("hallMessage");
    const board = $("hallBoard");

    message.textContent = "";
    board.innerHTML = `<div class="hall-loading">Načítám Síň slávy…</div>`;

    const { data, error } = await db.rpc(
      "spark_hall_of_fame",
      {
        p_search: search.trim() || null,
        p_limit: 100,
        p_offset: 0
      }
    );

    if (error) {
      console.error(error);
      board.innerHTML = "";
      message.textContent = `Síň slávy se nepodařilo načíst: ${error.message}`;
      return;
    }

    renderRows(data || []);
  }

  async function renderMyRank(profile) {
    const wrap = $("hallMyRank");

    if (!profile?.kick_user_id || !profile?.kick_username) {
      wrap.innerHTML = "";
      return;
    }

    const { data, error } = await db.rpc(
      "spark_hall_of_fame",
      {
        p_search: profile.kick_username,
        p_limit: 20,
        p_offset: 0
      }
    );

    if (error) {
      console.warn("Moje umístění se nepodařilo načíst:", error.message);
      return;
    }

    const exact = (data || []).find(
      row =>
        String(row.kick_user_id) === String(profile.kick_user_id)
    );

    if (!exact) {
      wrap.innerHTML = "";
      return;
    }

    const lifetime = Number(exact.lifetime_earned || 0);
    const name = exact.kick_display_name || exact.kick_username || "Světlonoš";

    wrap.innerHTML = `
      <a class="hall-my-rank" href="../profil/?u=${encodeURIComponent(exact.kick_username)}">
        <div>
          <div class="live-kicker">Tvoje umístění</div>
          <strong>#${format(exact.rank)} · ${esc(name)}</strong>
          <span>${esc(levelFor(lifetime))}</span>
        </div>

        <div class="hall-my-rank-points">
          ${format(lifetime)} <span>✦</span>
        </div>
      </a>
    `;
  }

  function bindUi() {
    const input = $("hallSearchInput");

    $("hallSearchButton").onclick = () => {
      loadHall(input.value);
    };

    $("hallResetButton").onclick = () => {
      input.value = "";
      loadHall("");
    };

    input.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        loadHall(input.value);
      }
    });
  }

  window.addEventListener(
    "svetlonosi-account-changed",
    event => {
      renderMyRank(event.detail?.profile ?? null);
    }
  );

  bindUi();
  loadHall("");

  renderMyRank(
    window.SVETLONOSI_ACCOUNT?.getProfile?.() ?? null
  );
})();
