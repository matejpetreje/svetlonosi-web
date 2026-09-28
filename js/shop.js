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
  let profile = null;
  let rows = [];
  let selectedCategory = "Vše";
  let ownershipFilter = "all";

  function groupProducts() {
    const map = new Map();

    for (const row of rows) {
      if (!map.has(row.product_id)) {
        map.set(row.product_id, {
          id: row.product_id,
          slug: row.product_slug,
          name: row.product_name,
          description: row.product_description,
          type: row.cosmetic_type,
          category: row.category,
          variants: []
        });
      }

      map.get(row.product_id).variants.push(row);
    }

    return [...map.values()];
  }

  async function loadSessionProfile() {
    const { data } = await db.auth.getSession();

    session = data.session ?? null;
    profile = window.SVETLONOSI_ACCOUNT?.getProfile?.() ?? null;

    if (session?.user && !profile) {
      const result = await db
        .from("spark_profiles")
        .select("*")
        .eq("user_id", session.user.id)
        .maybeSingle();

      profile = result.data ?? null;
    }

    renderWallet();
    renderAuthGate();
  }

  function renderWallet() {
    $("shopWalletBalance").textContent =
      profile?.kick_user_id
        ? `${format(profile.balance)} ✦`
        : "— ✦";
  }

  function renderAuthGate() {
    const gate = $("shopAuthGate");

    if (session?.user && profile?.kick_user_id) {
      gate.innerHTML = "";
      return;
    }

    gate.innerHTML = `
      <div class="spark-login-gate spark-login-gate-inline">
        <div>
          <strong>Přihlášení je potřeba až pro nákup.</strong>
          <span>Katalog si můžeš prohlížet i bez přihlášení.</span>
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

  async function loadCatalog() {
    const { data, error } =
      await db.rpc("spark_shop_catalog");

    if (error) {
      console.error(error);
      $("shopGrid").innerHTML = "";
      $("shopMessage").textContent =
        "Obchod se nepodařilo načíst: " + error.message;
      return;
    }

    rows = data ?? [];
    renderFilters();
    renderGrid();
  }

  function renderFilters() {
    const categories = [
      "Vše",
      ...new Set(rows.map(row => row.category).filter(Boolean))
    ];

    $("shopCategoryFilters").innerHTML =
      categories
        .map(category => `
          <button
            class="spark-filter-button ${category === selectedCategory ? "is-active" : ""}"
            type="button"
            data-shop-category="${esc(category)}"
          >
            ${esc(category)}
          </button>
        `)
        .join("");

    $("shopCategoryFilters")
      .querySelectorAll("[data-shop-category]")
      .forEach(button => {
        button.onclick = () => {
          selectedCategory = button.dataset.shopCategory;
          renderFilters();
          renderGrid();
        };
      });
  }

  function filteredProducts() {
    return groupProducts()
      .map(product => ({
        ...product,
        variants: product.variants.filter(variant => {
          if (ownershipFilter === "owned") {
            return variant.owned === true;
          }

          if (ownershipFilter === "available") {
            return variant.owned !== true;
          }

          return true;
        })
      }))
      .filter(product => {
        const categoryOk =
          selectedCategory === "Vše"
          ||
          product.category === selectedCategory;

        return categoryOk && product.variants.length > 0;
      });
  }

  function renderGrid() {
    const products = filteredProducts();

    $("shopGrid").innerHTML =
      products.length
        ? products.map(product => {
            const first = product.variants[0];
            const minPrice = Math.min(
              ...product.variants.map(v => Number(v.price || 0))
            );

            const ownedCount =
              product.variants.filter(v => v.owned).length;

            return `
              <button
                class="spark-store-card"
                type="button"
                data-product-id="${product.id}"
              >
                ${previewMarkup(first, "spark-store-card-preview")}

                <div class="spark-store-card-body">
                  <span class="spark-store-card-category">
                    ${esc(product.category)}
                  </span>

                  <strong>${esc(product.name)}</strong>

                  <p>${esc(product.description)}</p>

                  <div class="spark-store-card-footer">
                    <span>
                      od ${format(minPrice)} ✦
                    </span>

                    <small>
                      ${product.variants.length} variant
                      · ${ownedCount} vlastněno
                    </small>
                  </div>
                </div>
              </button>
            `;
          }).join("")
        : `
          <div class="hall-empty">
            Tomuto filtru neodpovídají žádné položky.
          </div>
        `;

    bindAnimatedPreviews($("shopGrid"));

    $("shopGrid")
      .querySelectorAll("[data-product-id]")
      .forEach(button => {
        button.onclick = () => {
          openProduct(button.dataset.productId);
        };
      });
  }

  function variantSlot(variant, selectedId) {
    return `
      <button
        class="spark-variant-slot ${variant.variant_id === selectedId ? "is-selected" : ""}"
        type="button"
        data-variant-id="${variant.variant_id}"
        title="${esc(variant.variant_name)}"
      >
        ${previewMarkup(variant, "spark-variant-preview")}
        <span>${esc(variant.variant_name)}</span>
      </button>
    `;
  }

  function openProduct(productId) {
    const product =
      groupProducts().find(item => item.id === productId);

    if (!product) {
      return;
    }

    const firstAvailable =
      product.variants.find(v => !v.owned)
      ||
      product.variants[0];

    renderProductModal(product, firstAvailable.variant_id);

    $("shopProductModal").hidden = false;
  }

  function renderProductModal(product, selectedId) {
    const selected =
      product.variants.find(v => v.variant_id === selectedId)
      ||
      product.variants[0];

    const owned = selected.owned === true;
    const enough =
      Number(profile?.balance || 0) >= Number(selected.price || 0);

    $("shopModalContent").innerHTML = `
      <div class="spark-product-layout">

        <div class="spark-product-large-preview">
          ${previewMarkup(selected, "spark-product-preview")}
        </div>

        <div class="spark-product-info">

          <div class="live-kicker">
            ${esc(product.category)}
          </div>

          <h2>${esc(product.name)}</h2>

          <p>${esc(product.description)}</p>

          <div class="spark-product-variant-label">
            Varianta
            <strong>${esc(selected.variant_name)}</strong>
          </div>

          <div class="spark-variant-grid">
            ${product.variants
              .map(variant => variantSlot(variant, selected.variant_id))
              .join("")}
          </div>

          <div class="spark-product-buy-row">
            <div>
              <span>Cena</span>
              <strong>${format(selected.price)} ✦</strong>
            </div>

            ${
              owned
                ? `
                  <a
                    class="btn"
                    href="../inventar/"
                  >
                    Už vlastníš · otevřít inventář
                  </a>
                `
                : session?.user && profile?.kick_user_id
                  ? `
                    <button
                      class="btn primary"
                      type="button"
                      id="shopBuyButton"
                      ${enough ? "" : "disabled"}
                    >
                      ${enough ? "Koupit variantu" : "Nedostatek Jisker"}
                    </button>
                  `
                  : `
                    <button
                      class="btn primary"
                      type="button"
                      data-account-open
                    >
                      Přihlásit se pro nákup
                    </button>
                  `
            }
          </div>

          <div class="spark-product-wallet-note">
            Peněženka:
            <strong>${profile?.kick_user_id ? `${format(profile.balance)} ✦` : "nepřihlášen"}</strong>
          </div>

        </div>

      </div>
    `;

    bindAnimatedPreviews($("shopModalContent"));

    $("shopModalContent")
      .querySelectorAll("[data-variant-id]")
      .forEach(button => {
        button.onclick = () => {
          renderProductModal(product, button.dataset.variantId);
        };
      });

    window.SVETLONOSI_ACCOUNT?.bindOpenButtons?.();

    const buyButton = $("shopBuyButton");

    if (buyButton) {
      buyButton.onclick = () => buyVariant(product, selected);
    }
  }

  async function buyVariant(product, variant) {
    const button = $("shopBuyButton");

    if (!button) {
      return;
    }

    button.disabled = true;
    button.textContent = "Nakupuji…";
    $("shopMessage").textContent = "";

    const { data, error } =
      await db.rpc(
        "spark_buy_variant",
        {
          p_variant_id: variant.variant_id
        }
      );

    if (error) {
      console.error(error);
      $("shopMessage").textContent =
        "Nákup se nepodařil: " + error.message;
      button.disabled = false;
      button.textContent = "Koupit variantu";
      return;
    }

    if (profile) {
      profile.balance = data?.balance ?? profile.balance;
    }

    variant.owned = true;

    renderWallet();
    renderGrid();
    renderProductModal(product, variant.variant_id);

    $("shopMessage").textContent =
      `Zakoupeno: ${product.name} — ${variant.variant_name}.`;

    window.SVETLONOSI_ACCOUNT?.refresh?.();
  }

  $("shopOwnershipFilter").addEventListener(
    "change",
    event => {
      ownershipFilter = event.target.value;
      renderGrid();
    }
  );

  $("shopModalClose").onclick = () => {
    $("shopProductModal").hidden = true;
  };

  $("shopProductModal").addEventListener(
    "click",
    event => {
      if (event.target === $("shopProductModal")) {
        $("shopProductModal").hidden = true;
      }
    }
  );

  window.addEventListener(
    "svetlonosi-account-changed",
    event => {
      profile = event.detail?.profile ?? null;
      session = event.detail?.session ?? session;
      renderWallet();
      renderAuthGate();
      loadCatalog();
    }
  );

  (async () => {
    await loadSessionProfile();
    await loadCatalog();
  })();

})();
