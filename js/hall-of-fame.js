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

  let session = null;
  let globalRows = [];
  let allRows = [];
  let badgeMap = new Map();
  let currentPage = 1;
  let pageSize = 20;
  let currentSearch = "";

  const EASTER_EGG_SEARCH_CODE =
    "easteregghra";

  function openEasterEggIfMatched(value) {
    const normalized =
      String(value ?? "")
        .trim()
        .toLocaleLowerCase("cs-CZ");

    if (
      normalized !==
      EASTER_EGG_SEARCH_CODE
    ) {
      return false;
    }

    window.location.assign("/hra/");
    return true;
  }

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
      if (lifetime >= threshold) {
        current = name;
      } else {
        break;
      }
    }

    return current;
  }

  function applyDenseRanks(rows) {
    const sorted = [...rows].sort((a, b) => {
      const pointsDiff =
        Number(b.lifetime_earned || 0)
        -
        Number(a.lifetime_earned || 0);

      if (pointsDiff !== 0) {
        return pointsDiff;
      }

      return String(a.kick_username || "")
        .localeCompare(
          String(b.kick_username || ""),
          "cs",
          { sensitivity: "base" }
        );
    });

    let denseRank = 0;
    let previousPoints = null;

    return sorted.map(row => {
      const points =
        Number(row.lifetime_earned || 0);

      if (
        previousPoints === null
        ||
        points !== previousPoints
      ) {
        denseRank += 1;
        previousPoints = points;
      }

      return {
        ...row,
        rank: denseRank
      };
    });
  }

  function filterHallRows(rows, search = "") {
    const needle =
      String(search || "")
        .trim()
        .toLocaleLowerCase("cs-CZ");

    if (!needle) {
      return rows;
    }

    return rows.filter(row => {
      const username =
        String(row.kick_username || "")
          .toLocaleLowerCase("cs-CZ");

      const displayName =
        String(row.kick_display_name || "")
          .toLocaleLowerCase("cs-CZ");

      return username.includes(needle)
        ||
        displayName.includes(needle);
    });
  }

  function showLockedState() {
    $("hallMyRank").innerHTML = "";
    $("hallListSummary").textContent = "";
    $("hallPagination").innerHTML = "";
    $("hallMessage").textContent = "";

    $("hallBoard").innerHTML = `
      <div class="spark-login-gate hall-login-gate">
        <div class="spark-login-gate-icon">✦</div>

        <div>
          <strong>Síň slávy je dostupná po přihlášení.</strong>
          <span>
            KICK přezdívky, pořadí a veřejné profily vidí jen
            přihlášení členové komunity.
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

    const toolbar =
      document.querySelector(".hall-list-toolbar");

    if (toolbar) {
      toolbar.hidden = true;
    }

    const search =
      document.querySelector(".hall-search-row");

    if (search) {
      search.hidden = true;
    }

    window.SVETLONOSI_ACCOUNT?.bindOpenButtons?.();
  }

  function showUnlockedState() {
    const toolbar =
      document.querySelector(".hall-list-toolbar");

    if (toolbar) {
      toolbar.hidden = false;
    }

    const search =
      document.querySelector(".hall-search-row");

    if (search) {
      search.hidden = false;
    }
  }

  function badgeMarkup(badge) {
    if (!badge) {
      return "";
    }

    if (badge.preview_static_url) {
      return `
        <img
          class="profile-badge-image"
          src="${esc(badge.preview_static_url)}"
          alt="${esc(badge.variant_name || "Odznak")}"
        >
      `;
    }

    return `
      <span class="profile-badge-glyph spark-accent-${esc(badge.accent_key || "gold")}">
        ${esc(badge.preview_glyph || "✦")}
      </span>
    `;
  }

  async function loadBadges(rows) {
    badgeMap = new Map();

    const usernames =
      [...new Set(
        (rows || [])
          .map(row => row.kick_username)
          .filter(Boolean)
      )];

    if (!usernames.length) {
      return;
    }

    /*
      Nejprve zkusíme hromadnou RPC funkci.
      Pokud nebyla nasazená nebo vrátí chybu,
      použijeme jako fallback už existující spark_profile_equipped.
    */
    let batchWorked = false;

    try {
      const chunkSize = 100;

      for (
        let offset = 0;
        offset < usernames.length;
        offset += chunkSize
      ) {
        const chunk =
          usernames.slice(
            offset,
            offset + chunkSize
          );

        const {
          data,
          error
        } =
          await db.rpc(
            "spark_badges_for_usernames",
            {
              p_usernames: chunk
            }
          );

        if (error) {
          throw error;
        }

        for (const badge of data || []) {
          badgeMap.set(
            String(
              badge.kick_username || ""
            ).toLowerCase(),
            badge
          );
        }
      }

      batchWorked = true;
    }
    catch (error) {
      console.warn(
        "Hromadné načtení badge selhalo, používám fallback:",
        error?.message || error
      );
    }

    /*
      I když batch proběhl, doplníme případně chybějící badge
      přes spark_profile_equipped. Tím je Síň slávy odolná i vůči
      rozdílům ve velikosti písmen nebo starší SQL verzi.
    */
    const missingUsernames =
      usernames.filter(
        username =>
          !badgeMap.has(
            String(username).toLowerCase()
          )
      );

    if (!missingUsernames.length) {
      return;
    }

    const results =
      await Promise.allSettled(
        missingUsernames.map(
          async username => {
            const {
              data,
              error
            } =
              await db.rpc(
                "spark_profile_equipped",
                {
                  p_username: username
                }
              );

            if (error) {
              throw error;
            }

            const badge =
              (data || [])
                .find(
                  item =>
                    item.slot_type ===
                    "badge"
                );

            return {
              username,
              badge
            };
          }
        )
      );

    for (const result of results) {
      if (
        result.status !==
        "fulfilled"
      ) {
        continue;
      }

      const {
        username,
        badge
      } =
        result.value;

      if (!badge) {
        continue;
      }

      badgeMap.set(
        String(username).toLowerCase(),
        {
          kick_username:
            username,

          variant_id:
            badge.variant_id,

          variant_name:
            badge.variant_name,

          preview_glyph:
            badge.preview_glyph,

          preview_static_url:
            badge.preview_static_url,

          preview_animated_url:
            badge.preview_animated_url,

          accent_key:
            badge.accent_key,

          rarity:
            badge.rarity
        }
      );
    }
  }

  function avatarMarkup(row) {
    const name =
      row.kick_display_name ||
      row.kick_username ||
      "Světlonoš";

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
    if (!rows?.length) {
      $("hallBoard").innerHTML = `
        <div class="hall-empty">
          Nikdo s touto přezdívkou zatím v Síni slávy není.
        </div>
      `;
      return;
    }

    $("hallBoard").innerHTML = `
      <div class="hall-board-head">
        <span>#</span>
        <span>Světlonoš</span>
        <span>Hodnost</span>
        <span>Celkem Jisker</span>
      </div>

      ${rows.map(row => {
        const name =
          row.kick_display_name ||
          row.kick_username ||
          "Světlonoš";

        const lifetime =
          Number(row.lifetime_earned || 0);

        const profileUrl =
          `../profil/?u=${encodeURIComponent(row.kick_username || "")}`;

        return `
          <a class="hall-row" href="${profileUrl}">
            <div class="hall-rank hall-rank-${Number(row.rank) <= 3 ? Number(row.rank) : "other"}">
              ${format(row.rank)}
            </div>

            <div class="hall-user">
              <div class="hall-avatar">
                ${avatarMarkup(row)}
                ${
                  badgeMap.get(String(row.kick_username || "").toLowerCase())
                    ? `<span class="profile-badge-overlay profile-badge-overlay-hall" title="${esc(badgeMap.get(String(row.kick_username || "").toLowerCase()).variant_name || "Odznak")}">${badgeMarkup(badgeMap.get(String(row.kick_username || "").toLowerCase()))}</span>`
                    : ""
                }
              </div>

              <div class="hall-user-copy">
                <strong>${esc(name)}</strong>
                <span>@${esc(row.kick_username || name)}</span>
              </div>
            </div>

            <div class="hall-level">
              ${esc(levelFor(lifetime))}
            </div>

            <div class="hall-lifetime">
              ${format(lifetime)}
              <span>✦</span>
            </div>
          </a>
        `;
      }).join("")}
    `;
  }

  function pageCount() {
    return Math.max(1, Math.ceil(allRows.length / pageSize));
  }

  function pageNumbers(totalPages, page) {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const set = new Set([
      1,
      totalPages,
      page - 2,
      page - 1,
      page,
      page + 1,
      page + 2
    ]);

    const nums =
      [...set]
        .filter(n => n >= 1 && n <= totalPages)
        .sort((a, b) => a - b);

    const out = [];

    nums.forEach((n, index) => {
      if (index && n - nums[index - 1] > 1) {
        out.push("…");
      }

      out.push(n);
    });

    return out;
  }

  function renderPagination() {
    const pagination = $("hallPagination");
    const summary = $("hallListSummary");
    const total = allRows.length;
    const pages = pageCount();

    currentPage = Math.min(currentPage, pages);

    if (!total) {
      summary.textContent =
        currentSearch
          ? "Nenalezen žádný Světlonoš."
          : "Síň slávy je zatím prázdná.";

      pagination.innerHTML = "";
      return;
    }

    const start = (currentPage - 1) * pageSize;
    const end = Math.min(start + pageSize, total);

    summary.textContent =
      `Celkem ${format(total)} Světlonošů · zobrazeno ${format(start + 1)}–${format(end)}`;

    if (pages <= 1) {
      pagination.innerHTML = "";
      return;
    }

    pagination.innerHTML = `
      <button
        class="hall-page-button hall-page-nav"
        type="button"
        data-page="${currentPage - 1}"
        ${currentPage <= 1 ? "disabled" : ""}
      >
        ← Předchozí
      </button>

      <div class="hall-page-numbers">
        ${pageNumbers(pages, currentPage).map(item =>
          item === "…"
            ? `<span class="hall-page-ellipsis">…</span>`
            : `
              <button
                class="hall-page-button ${item === currentPage ? "is-active" : ""}"
                type="button"
                data-page="${item}"
              >
                ${item}
              </button>
            `
        ).join("")}
      </div>

      <button
        class="hall-page-button hall-page-nav"
        type="button"
        data-page="${currentPage + 1}"
        ${currentPage >= pages ? "disabled" : ""}
      >
        Další →
      </button>
    `;

    pagination
      .querySelectorAll("[data-page]")
      .forEach(button => {
        button.onclick = () => {
          if (button.disabled) return;

          currentPage = Number(button.dataset.page);
          renderCurrentPage();

          $("hallBoard")?.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
        };
      });
  }

  function renderCurrentPage() {
    const start = (currentPage - 1) * pageSize;

    renderRows(
      allRows.slice(start, start + pageSize)
    );

    renderPagination();
  }

  async function fetchAllHallRows(search = "") {
    const rows = [];
    const chunkSize = 100;
    let offset = 0;

    while (true) {
      const { data, error } =
        await db.rpc(
          "spark_hall_of_fame",
          {
            p_search: search.trim() || null,
            p_limit: chunkSize,
            p_offset: offset
          }
        );

      if (error) throw error;

      const chunk = data || [];
      rows.push(...chunk);

      if (chunk.length < chunkSize) break;

      offset += chunkSize;

      if (offset >= 10000) break;
    }

    return rows;
  }

  async function loadHall(search = "") {
    if (!session?.user) {
      showLockedState();
      return;
    }

    showUnlockedState();

    currentSearch = search.trim();
    currentPage = 1;

    $("hallMessage").textContent = "";
    $("hallListSummary").textContent = "Načítám pořadí…";
    $("hallPagination").innerHTML = "";
    $("hallBoard").innerHTML = `<div class="hall-loading">Načítám Síň slávy…</div>`;

    try {
      globalRows = applyDenseRanks(
        await fetchAllHallRows("")
      );

      allRows = filterHallRows(
        globalRows,
        currentSearch
      );

      await loadBadges(allRows);
      renderCurrentPage();
    } catch (error) {
      console.error(error);
      allRows = [];
      $("hallBoard").innerHTML = "";
      $("hallListSummary").textContent = "";
      $("hallPagination").innerHTML = "";
      $("hallMessage").textContent =
        "Síň slávy se nepodařilo načíst: " + error.message;
    }
  }

  async function renderMyRank(profile) {
    const wrap = $("hallMyRank");

    if (!session?.user || !profile?.kick_username) {
      wrap.innerHTML = "";
      return;
    }

    if (!globalRows.length) {
      try {
        globalRows = applyDenseRanks(
          await fetchAllHallRows("")
        );
      } catch (_) {
        return;
      }
    }

    const exact =
      globalRows.find(
        row =>
          String(row.kick_user_id) ===
          String(profile.kick_user_id)
      );

    if (!exact) {
      wrap.innerHTML = "";
      return;
    }

    const lifetime =
      Number(exact.lifetime_earned || 0);

    wrap.innerHTML = `
      <a
        class="hall-my-rank"
        href="../profil/?u=${encodeURIComponent(exact.kick_username)}"
      >
        <div>
          <div class="live-kicker">Tvoje umístění</div>
          <strong>#${format(exact.rank)} · ${esc(exact.kick_display_name || exact.kick_username)}</strong>
          <span>${esc(levelFor(lifetime))}</span>
        </div>

        <div class="hall-my-rank-points">
          ${format(lifetime)}
          <span>✦</span>
        </div>
      </a>
    `;
  }

  $("hallSearchButton").onclick =
    () => {
      const value =
        $("hallSearchInput").value;

      if (
        openEasterEggIfMatched(
          value
        )
      ) {
        return;
      }

      loadHall(value);
    };

  $("hallResetButton").onclick =
    () => {
      $("hallSearchInput").value = "";
      loadHall("");
    };

  $("hallSearchInput").addEventListener(
    "keydown",
    event => {
      if (event.key === "Enter") {
        event.preventDefault();

        const value =
          $("hallSearchInput").value;

        if (
          openEasterEggIfMatched(
            value
          )
        ) {
          return;
        }

        loadHall(value);
      }
    }
  );

  $("hallPageSize").addEventListener(
    "change",
    event => {
      const value = Number(event.target.value);

      pageSize =
        [20, 50, 100].includes(value)
          ? value
          : 20;

      currentPage = 1;
      renderCurrentPage();
    }
  );

  window.addEventListener(
    "svetlonosi-account-changed",
    async event => {
      session = event.detail?.session ?? null;

      if (!session?.user) {
        showLockedState();
        return;
      }

      await loadHall("");
      await renderMyRank(event.detail?.profile ?? null);
    }
  );

  (async () => {
    const { data } = await db.auth.getSession();
    session = data.session ?? null;

    if (!session?.user) {
      showLockedState();
      return;
    }

    await loadHall("");
    await renderMyRank(
      window.SVETLONOSI_ACCOUNT?.getProfile?.() ?? null
    );
  })();

})();
