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

  let allRows = [];
  let currentPage = 1;
  let pageSize = 20;
  let currentSearch = "";

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

    return `
      <span>
        ${esc(name.trim().charAt(0).toUpperCase() || "✦")}
      </span>
    `;
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
            <div class="hall-rank hall-rank-${
              Number(row.rank) <= 3
                ? Number(row.rank)
                : "other"
            }">
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
              ${format(lifetime)}
              <span>✦</span>
            </div>
          </a>
        `;
      }).join("")}
    `;
  }

  function pageCount() {
    return Math.max(
      1,
      Math.ceil(allRows.length / pageSize)
    );
  }

  function pageNumbers(totalPages, page) {
    if (totalPages <= 7) {
      return Array.from(
        { length: totalPages },
        (_, index) => index + 1
      );
    }

    const items = new Set([
      1,
      totalPages,
      page - 2,
      page - 1,
      page,
      page + 1,
      page + 2
    ]);

    const numbers = [...items]
      .filter(value => value >= 1 && value <= totalPages)
      .sort((a, b) => a - b);

    const output = [];

    numbers.forEach((number, index) => {
      const previous = numbers[index - 1];

      if (index > 0 && number - previous > 1) {
        output.push("…");
      }

      output.push(number);
    });

    return output;
  }

  function renderPagination() {
    const pagination = $("hallPagination");
    const summary = $("hallListSummary");

    const total = allRows.length;
    const totalPages = pageCount();

    if (currentPage > totalPages) {
      currentPage = totalPages;
    }

    if (!total) {
      summary.textContent =
        currentSearch
          ? "Nenalezen žádný Světlonoš."
          : "Síň slávy je zatím prázdná.";

      pagination.innerHTML = "";
      return;
    }

    const start =
      (currentPage - 1) * pageSize;

    const end =
      Math.min(start + pageSize, total);

    summary.textContent =
      currentSearch
        ? `Nalezeno ${format(total)} · zobrazeno ${format(start + 1)}–${format(end)}`
        : `Celkem ${format(total)} Světlonošů · zobrazeno ${format(start + 1)}–${format(end)}`;

    if (totalPages <= 1) {
      pagination.innerHTML = "";
      return;
    }

    const numbers =
      pageNumbers(totalPages, currentPage);

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
        ${numbers.map(item => {
          if (item === "…") {
            return `
              <span class="hall-page-ellipsis">…</span>
            `;
          }

          return `
            <button
              class="hall-page-button ${item === currentPage ? "is-active" : ""}"
              type="button"
              data-page="${item}"
              ${item === currentPage ? 'aria-current="page"' : ""}
            >
              ${item}
            </button>
          `;
        }).join("")}
      </div>

      <button
        class="hall-page-button hall-page-nav"
        type="button"
        data-page="${currentPage + 1}"
        ${currentPage >= totalPages ? "disabled" : ""}
      >
        Další →
      </button>
    `;

    pagination
      .querySelectorAll("[data-page]")
      .forEach(button => {
        button.onclick = () => {
          if (button.disabled) {
            return;
          }

          const nextPage =
            Number(button.dataset.page);

          if (!Number.isFinite(nextPage)) {
            return;
          }

          currentPage =
            Math.max(
              1,
              Math.min(totalPages, nextPage)
            );

          renderCurrentPage();

          $("hallBoard")
            ?.scrollIntoView({
              behavior: "smooth",
              block: "start"
            });
        };
      });
  }

  function renderCurrentPage() {
    const totalPages = pageCount();

    currentPage =
      Math.max(
        1,
        Math.min(currentPage, totalPages)
      );

    const start =
      (currentPage - 1) * pageSize;

    const rows =
      allRows.slice(
        start,
        start + pageSize
      );

    renderRows(rows);
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
            p_search:
              search.trim() || null,
            p_limit:
              chunkSize,
            p_offset:
              offset
          }
        );

      if (error) {
        throw error;
      }

      const chunk =
        data || [];

      rows.push(...chunk);

      if (chunk.length < chunkSize) {
        break;
      }

      offset += chunkSize;

      if (offset >= 10000) {
        break;
      }
    }

    return rows;
  }

  async function loadHall(search = "") {
    const message = $("hallMessage");
    const board = $("hallBoard");
    const summary = $("hallListSummary");
    const pagination = $("hallPagination");

    currentSearch = search.trim();
    currentPage = 1;

    message.textContent = "";
    summary.textContent = "Načítám pořadí…";
    pagination.innerHTML = "";

    board.innerHTML = `
      <div class="hall-loading">
        Načítám Síň slávy…
      </div>
    `;

    try {
      allRows =
        await fetchAllHallRows(currentSearch);

      renderCurrentPage();
    } catch (error) {
      console.error(error);

      allRows = [];
      board.innerHTML = "";
      summary.textContent = "";
      pagination.innerHTML = "";

      message.textContent =
        `Síň slávy se nepodařilo načíst: ${
          error?.message || String(error)
        }`;
    }
  }

  async function renderMyRank(profile) {
    const wrap = $("hallMyRank");

    if (
      !profile?.kick_user_id ||
      !profile?.kick_username
    ) {
      wrap.innerHTML = "";
      return;
    }

    const { data, error } =
      await db.rpc(
        "spark_hall_of_fame",
        {
          p_search:
            profile.kick_username,
          p_limit:
            20,
          p_offset:
            0
        }
      );

    if (error) {
      console.warn(
        "Moje umístění se nepodařilo načíst:",
        error.message
      );
      return;
    }

    const exact =
      (data || []).find(
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

    const name =
      exact.kick_display_name ||
      exact.kick_username ||
      "Světlonoš";

    wrap.innerHTML = `
      <a
        class="hall-my-rank"
        href="../profil/?u=${encodeURIComponent(exact.kick_username)}"
      >
        <div>
          <div class="live-kicker">
            Tvoje umístění
          </div>

          <strong>
            #${format(exact.rank)} · ${esc(name)}
          </strong>

          <span>
            ${esc(levelFor(lifetime))}
          </span>
        </div>

        <div class="hall-my-rank-points">
          ${format(lifetime)}
          <span>✦</span>
        </div>
      </a>
    `;
  }

  function bindUi() {
    const input = $("hallSearchInput");
    const pageSizeSelect = $("hallPageSize");

    $("hallSearchButton").onclick =
      () => {
        loadHall(input.value);
      };

    $("hallResetButton").onclick =
      () => {
        input.value = "";
        loadHall("");
      };

    input.addEventListener(
      "keydown",
      event => {
        if (event.key === "Enter") {
          event.preventDefault();
          loadHall(input.value);
        }
      }
    );

    pageSizeSelect.addEventListener(
      "change",
      () => {
        const selected =
          Number(pageSizeSelect.value);

        pageSize =
          [20, 50, 100].includes(selected)
            ? selected
            : 20;

        currentPage = 1;
        renderCurrentPage();
      }
    );
  }

  window.addEventListener(
    "svetlonosi-account-changed",
    event => {
      renderMyRank(
        event.detail?.profile ?? null
      );
    }
  );

  bindUi();
  loadHall("");

  renderMyRank(
    window
      .SVETLONOSI_ACCOUNT
      ?.getProfile?.()
    ??
    null
  );

})();
