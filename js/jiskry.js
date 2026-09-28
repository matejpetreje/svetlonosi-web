(() => {
  const cfg = window.SVETLONOSI_CONFIG;
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

  const FALLBACK_RULES = [
    {
      key: "vote",
      label: "Hlas v anketě",
      description: "Jeden platný hlas v jednom hlasování.",
      amount: 5,
      icon: "☑"
    },
    {
      key: "watch_30m",
      label: "30 minut na streamu",
      description: "Ověřená účast přes propojený KICK účet.",
      amount: 10,
      icon: "◷"
    },
    {
      key: "chat_window",
      label: "Aktivita v chatu",
      description: "Smysluplná aktivita v časovém okně. Ne za každou zprávu.",
      amount: 2,
      icon: "⌁"
    },
    {
      key: "all_polls_bonus",
      label: "Všechna hlasování",
      description: "Bonus za účast ve všech anketách daného streamu.",
      amount: 15,
      icon: "✦"
    },
    {
      key: "streak_3",
      label: "3 streamy v řadě",
      description: "Série se počítá po splnění minimální účasti.",
      amount: 25,
      icon: "Ⅲ"
    },
    {
      key: "streak_5",
      label: "5 streamů v řadě",
      description: "Vyšší bonus za pravidelnou účast.",
      amount: 50,
      icon: "Ⅴ"
    }
  ];

  const FALLBACK_REWARDS = [
    {
      name: "Kosmetický odznak",
      description: "Speciální odznak u profilu Světlonoše.",
      price: 500,
      category: "Kosmetika"
    },
    {
      name: "Rámeček profilu",
      description: "Odemkni tematický rámeček pro svůj profil.",
      price: 1000,
      category: "Kosmetika"
    },
    {
      name: "Navrhni možnost do ankety",
      description: "Přidej vlastní možnost do vhodného hlasování.",
      price: 1500,
      category: "Interakce"
    },
    {
      name: "Navrhni otázku do hlasování",
      description: "Pošli návrh otázky pro některý z dalších streamů.",
      price: 2500,
      category: "Interakce"
    },
    {
      name: "Prioritní otázka do streamu",
      description: "Tvoje otázka dostane přednost v komunitním bloku.",
      price: 4000,
      category: "Komunita"
    },
    {
      name: "Speciální titul",
      description: "Trvalý komunitní titul nebo role dle aktuální nabídky.",
      price: 5000,
      category: "Komunita"
    },
    {
      name: "Vyber menší část streamu",
      description: "Navrhni téma nebo zadání pro předem určený segment.",
      price: 7500,
      category: "Speciální"
    },
    {
      name: "Velká komunitní odměna",
      description: "Výraznější odměna vypsaná týmem Světlonošů.",
      price: 20000,
      category: "Speciální"
    }
  ];

  let rewards = [];
  let category = "Vše";

  function format(n) {
    return Number(n ?? 0).toLocaleString("cs-CZ");
  }

  function renderRules(data) {
    const rules = (data?.length ? data : FALLBACK_RULES)
      .filter(r => r.enabled !== false);

    $("sparkEarnGrid").innerHTML = rules.map((r, index) => `
      <article class="spark-feature-card">
        <div class="spark-feature-top">
          <span class="spark-feature-icon">
            ${esc(r.icon || ["☑", "◷", "⌁", "✦", "Ⅲ", "Ⅴ"][index % 6])}
          </span>

          <span class="spark-feature-value">
            +${format(r.amount)} ✦
          </span>
        </div>

        <h3>${esc(r.label)}</h3>
        <p>${esc(r.description || "")}</p>
      </article>
    `).join("");
  }

  function renderFilters() {
    const categories = [
      "Vše",
      ...new Set(
        rewards
          .map(r => r.category)
          .filter(Boolean)
      )
    ];

    $("sparkRewardFilter").innerHTML = categories.map(c => `
      <button
        type="button"
        class="spark-filter-button ${c === category ? "is-active" : ""}"
        data-category="${esc(c)}"
      >
        ${esc(c)}
      </button>
    `).join("");

    $("sparkRewardFilter")
      .querySelectorAll("[data-category]")
      .forEach(button => {
        button.onclick = () => {
          category = button.dataset.category;
          renderFilters();
          renderRewards();
        };
      });
  }

  function renderRewards() {
    const visible = rewards.filter(r =>
      r.enabled !== false &&
      (category === "Vše" || r.category === category)
    );

    $("sparkRewardsPublic").innerHTML = visible.length
      ? visible.map(r => `
        <article class="spark-reward-card">
          <div class="spark-reward-card-top">
            <span class="spark-reward-category">
              ${esc(r.category || "Odměna")}
            </span>

            <span class="spark-reward-price">
              ${format(r.price)} <b>✦</b>
            </span>
          </div>

          <div class="spark-reward-glyph" aria-hidden="true">✦</div>

          <h3>${esc(r.name)}</h3>
          <p>${esc(r.description || "")}</p>

          <button
            class="btn spark-reward-button"
            type="button"
            data-account-open
          >
            Chci tuto odměnu
          </button>
        </article>
      `).join("")
      : `
        <div class="live-panel">
          <div class="muted">
            V této kategorii zatím nejsou žádné odměny.
          </div>
        </div>
      `;
  }

  function levelFor(lifetime) {
    const levels = [
      [0, "Zbloudilá jiskra"],
      [100, "Jiskra"],
      [300, "Plamínek"],
      [750, "Pochodeň"],
      [1500, "Světlonoš"],
      [3000, "Strážce světla"],
      [6000, "Nositel plamene"],
      [10000, "Věčný plamen"]
    ];

    let current = levels[0];
    let next = null;

    for (let i = 0; i < levels.length; i++) {
      if (lifetime >= levels[i][0]) {
        current = levels[i];
      } else {
        next = levels[i];
        break;
      }
    }

    const progress = next
      ? Math.max(
          0,
          Math.min(
            100,
            ((lifetime - current[0]) / (next[0] - current[0])) * 100
          )
        )
      : 100;

    return {
      name: current[1],
      progress
    };
  }

  function renderWalletAvatar(profile, displayName) {
    const avatar = $("sparkWalletAvatar");

    if (!avatar) {
      return;
    }

    if (profile?.kick_avatar_url) {
      avatar.innerHTML = `
        <img
          src="${esc(profile.kick_avatar_url)}"
          alt="${esc(displayName)}"
          referrerpolicy="no-referrer"
          style="
            width:100%;
            height:100%;
            display:block;
            object-fit:cover;
            border-radius:inherit;
          "
        >
      `;
      return;
    }

    if (profile) {
      const fallbackLetter =
        (displayName || "").trim().charAt(0).toUpperCase() || "✦";

      avatar.textContent = fallbackLetter;
      return;
    }

    avatar.textContent = "✦";
  }

  function renderWallet(profile) {
    if (!profile) {
      $("sparkWalletName").textContent = "Nepřihlášený poutník";
      $("sparkBalance").textContent = "—";
      $("sparkWalletCaption").textContent =
        "Přihlas se a propoj KICK, aby se Jiskry začaly počítat.";
      $("sparkLevelProgress").style.width = "0%";
      $("sparkLevelName").textContent = "Jiskra čeká na zažehnutí";
      $("sparkLifetime").textContent = "0 celkem";

      renderWalletAvatar(null, null);
      return;
    }

    const name =
      profile.kick_display_name ||
      profile.kick_username ||
      "Čeká na propojení KICK";

    const lifetime = Number(profile.lifetime_earned || 0);
    const level = levelFor(lifetime);

    $("sparkWalletName").textContent = name;
    $("sparkBalance").textContent = format(profile.balance || 0);
    $("sparkWalletCaption").textContent = profile.kick_user_id
      ? "KICK je propojený. Jiskry jsou aktivní."
      : "Pro aktivaci Jisker ještě propoj svůj KICK účet.";
    $("sparkLevelProgress").style.width = level.progress + "%";
    $("sparkLevelName").textContent = level.name;
    $("sparkLifetime").textContent = `${format(lifetime)} celkem`;

    renderWalletAvatar(profile, name);
  }

  async function loadCatalog() {
    const [rulesResult, rewardsResult] = await Promise.all([
      db
        .from("spark_rules")
        .select("key,label,description,amount,enabled,sort_order,icon")
        .eq("enabled", true)
        .order("sort_order"),

      db
        .from("spark_rewards")
        .select("id,name,description,price,category,enabled,sort_order")
        .eq("enabled", true)
        .order("sort_order")
        .order("price")
    ]);

    if (rulesResult.error) {
      console.warn(
        "Používám výchozí pravidla Jisker:",
        rulesResult.error.message
      );
    }

    if (rewardsResult.error) {
      console.warn(
        "Používám výchozí odměny Jisker:",
        rewardsResult.error.message
      );
    }

    renderRules(
      rulesResult.error
        ? FALLBACK_RULES
        : rulesResult.data
    );

    rewards =
      rewardsResult.error || !rewardsResult.data?.length
        ? FALLBACK_REWARDS
        : rewardsResult.data;

    renderFilters();
    renderRewards();
  }

  window.addEventListener(
    "svetlonosi-account-changed",
    event => {
      renderWallet(event.detail?.profile ?? null);
    }
  );

  renderWallet(
    window.SVETLONOSI_ACCOUNT?.getProfile?.() ?? null
  );

  loadCatalog();
})();
