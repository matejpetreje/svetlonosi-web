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


  function previewMarkup(item, extraClass = "") {
    const staticUrl = item.preview_static_url || "";
    const animatedUrl = item.preview_animated_url || "";
    const glyph = esc(item.preview_glyph || "✦");
    const accent = esc(item.accent_key || "gold");

    if (staticUrl) {
      return `
        <div
          class="spark-item-preview spark-accent-${accent} ${extraClass}"
          data-static-preview="${esc(staticUrl)}"
          data-animated-preview="${esc(animatedUrl)}"
        >
          <img
            src="${esc(staticUrl)}"
            alt=""
            loading="lazy"
          >
        </div>
      `;
    }

    return `
      <div
        class="spark-item-preview spark-item-preview-glyph spark-accent-${accent} ${extraClass}"
      >
        <span>${glyph}</span>
      </div>
    `;
  }

  function bindAnimatedPreviews(scope = document) {
    scope
      .querySelectorAll("[data-animated-preview]")
      .forEach(preview => {
        const img = preview.querySelector("img");
        const staticUrl = preview.dataset.staticPreview || "";
        const animatedUrl = preview.dataset.animatedPreview || "";

        if (!img || !animatedUrl) {
          return;
        }

        preview.addEventListener("mouseenter", () => {
          img.src = animatedUrl;
        });

        preview.addEventListener("mouseleave", () => {
          img.src = staticUrl;
        });
      });
  }


  let session = null;
  let rows = [];
  let selectedType = "Vše";

  const typeLabels = {
    badge: "Odznaky",
    frame: "Rámečky",
    background: "Pozadí",
    effect: "Efekty",
    title: "Tituly"
  };

  async function getSession() {
    const { data } = await db.auth.getSession();
    session = data.session ?? null;
    renderAuthGate();
  }

  function renderAuthGate() {
    const gate = $("inventoryAuthGate");

    if (session?.user) {
      gate.innerHTML = "";
      return;
    }

    gate.innerHTML = `
      <div class="spark-login-gate">
        <div class="spark-login-gate-icon">✦</div>
        <div>
          <strong>Inventář je soukromý.</strong>
          <span>Přihlas se přes KICK a zobraz svoji kolekci.</span>
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

    $("inventoryGrid").innerHTML = "";
    window.SVETLONOSI_ACCOUNT?.bindOpenButtons?.();
  }

  async function loadInventory() {
    if (!session?.user) {
      rows = [];
      renderAuthGate();
      return;
    }

    $("inventoryMessage").textContent = "";

    const { data, error } =
      await db.rpc("spark_my_inventory");

    if (error) {
      console.error(error);
      rows = [];
      $("inventoryGrid").innerHTML = "";
      $("inventoryMessage").textContent =
        "Inventář se nepodařilo načíst: " + error.message;
      return;
    }

    rows = data ?? [];

    renderFilters();
    renderInventory();
  }

  function renderFilters() {
    const presentTypes =
      [...new Set(rows.map(row => row.cosmetic_type))];

    const filters = [
      ["Vše", "Vše"],
      ...presentTypes.map(type => [type, typeLabels[type] || type])
    ];

    $("inventoryFilters").innerHTML =
      filters
        .map(([value, label]) => `
          <button
            class="spark-filter-button ${value === selectedType ? "is-active" : ""}"
            type="button"
            data-inventory-type="${esc(value)}"
          >
            ${esc(label)}
          </button>
        `)
        .join("");

    $("inventoryFilters")
      .querySelectorAll("[data-inventory-type]")
      .forEach(button => {
        button.onclick = () => {
          selectedType = button.dataset.inventoryType;
          renderFilters();
          renderInventory();
        };
      });
  }

  function renderInventory() {
    const visible =
      rows.filter(row =>
        selectedType === "Vše"
        ||
        row.cosmetic_type === selectedType
      );

    if (!visible.length) {
      $("inventoryGrid").innerHTML = `
        <div class="hall-empty">
          V této části inventáře zatím nic nemáš.
          <a href="../obchod/">Otevřít Obchod Jisker</a>
        </div>
      `;
      return;
    }

    $("inventoryGrid").innerHTML =
      visible
        .map(item => `
          <button
            class="spark-inventory-slot ${item.equipped ? "is-equipped" : ""}"
            type="button"
            data-equip-variant="${item.variant_id}"
            title="${esc(item.product_name)} — ${esc(item.variant_name)}"
          >
            ${previewMarkup(item, "spark-inventory-preview")}

            <span class="spark-inventory-name">
              ${esc(item.variant_name)}
            </span>

            <small>
              ${esc(typeLabels[item.cosmetic_type] || item.cosmetic_type)}
            </small>
          </button>
        `)
        .join("");

    bindAnimatedPreviews($("inventoryGrid"));

    $("inventoryGrid")
      .querySelectorAll("[data-equip-variant]")
      .forEach(button => {
        button.onclick = () => {
          equipVariant(button.dataset.equipVariant);
        };
      });
  }

  async function equipVariant(variantId) {
    const item =
      rows.find(row => row.variant_id === variantId);

    if (!item || item.equipped) {
      return;
    }

    $("inventoryMessage").textContent =
      "Nastavuji…";

    const { error } =
      await db.rpc(
        "spark_equip_variant",
        {
          p_variant_id: variantId
        }
      );

    if (error) {
      console.error(error);
      $("inventoryMessage").textContent =
        "Výběr se nepodařil: " + error.message;
      return;
    }

    for (const row of rows) {
      if (row.cosmetic_type === item.cosmetic_type) {
        row.equipped =
          row.variant_id === variantId;
      }
    }

    renderInventory();

    $("inventoryMessage").textContent =
      `${item.variant_name} je teď aktivní.`;
  }

  window.addEventListener(
    "svetlonosi-account-changed",
    async event => {
      session = event.detail?.session ?? null;

      if (!session?.user) {
        rows = [];
        renderAuthGate();
        return;
      }

      renderAuthGate();
      await loadInventory();
    }
  );

  (async () => {
    await getSession();
    await loadInventory();
  })();

})();
