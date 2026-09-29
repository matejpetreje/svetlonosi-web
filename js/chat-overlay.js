(() => {
  const cfg =
    window.SVETLONOSI_CONFIG;

  if (
    !cfg
    ||
    !window.supabase
  ) {
    return;
  }

  const db =
    supabase.createClient(
      cfg.SUPABASE_URL,
      cfg.SUPABASE_ANON_KEY
    );

  const overlay =
    document.getElementById(
      "chatOverlay"
    );

  const params =
    new URLSearchParams(
      window.location.search
    );

  const DOM_LIMIT =
    Math.min(
      500,
      Math.max(
        50,
        Number(
          params.get("buffer")
          ||
          200
        )
      )
    );

  if (
    params.get("compact")
    ===
    "1"
  ) {
    document.body.classList.add(
      "compact"
    );
  }

  const seen =
    new Set();

  const RANK_BADGE_ASSETS = {
    "Zbloudilá jiskra": "../assets/jiskry/badges/zbloudila-jiskra.png",
    "Jiskra": "../assets/jiskry/badges/jiskra.png",
    "Plamínek": "../assets/jiskry/badges/plaminek.png",
    "Pochodeň": "../assets/jiskry/badges/pochoden.png",
    "Světlonoš": "../assets/jiskry/badges/svetlonos.png",
    "Strážce plamene": "../assets/jiskry/badges/strazce-plamene.png",
    "Nositel světla": "../assets/jiskry/badges/nositel-svetla.png",
    "Věčný plamen": "../assets/jiskry/badges/vecny-plamen.png",
    "Maják Světlonošů": "../assets/jiskry/badges/majak-svetlonosu.png"
  };

  const esc =
    value =>
      String(
        value
        ??
        ""
      )
        .replaceAll(
          "&",
          "&amp;"
        )
        .replaceAll(
          "<",
          "&lt;"
        )
        .replaceAll(
          ">",
          "&gt;"
        )
        .replaceAll(
          '"',
          "&quot;"
        )
        .replaceAll(
          "'",
          "&#039;"
        );

  function badgeMarkup(
    message
  ) {
    if (
      !message.jiskry_badge_name
    ) {
      return "";
    }

    const title =
      esc(
        message.jiskry_badge_name
      );

    const accent =
      esc(
        message.jiskry_badge_accent_key
        ||
        "gold"
      );

    const badgeImageUrl =
      message.jiskry_badge_static_url
      ||
      RANK_BADGE_ASSETS[message.jiskry_badge_name]
      ||
      "";

    if (badgeImageUrl) {
      return `
        <span
          class="chat-jiskry-badge"
          title="${title}"
        >
          <img
            src="${esc(badgeImageUrl)}"
            alt=""
          >
        </span>
      `;
    }

    return `
      <span
        class="chat-jiskry-badge spark-accent-${accent}"
        title="${title}"
      >
        <span>
          ${esc(
            message.jiskry_badge_glyph
            ||
            "✦"
          )}
        </span>
      </span>
    `;
  }

  function renderMessage(
    message,
    animate = true
  ) {
    const id =
      String(
        message.id
        ||
        message.kick_message_id
        ||
        message.event_message_id
      );

    if (
      !id
      ||
      seen.has(id)
    ) {
      return;
    }

    seen.add(id);

    const element =
      document.createElement(
        "div"
      );

    element.className =
      "chat-message";

    element.dataset.messageId =
      id;

    const username =
      message.sender_username
      ||
      "KICK";

    const usernameColor =
      /^#[0-9a-fA-F]{6}$/
        .test(
          message.sender_username_color
          ||
          ""
        )
        ? message.sender_username_color
        : null;

    element.innerHTML = `
      <div class="chat-line">

        ${badgeMarkup(message)}

        <span
          class="chat-username"
          ${
            usernameColor
              ? `style="color:${usernameColor}"`
              : ""
          }
        >
          ${esc(username)}
        </span>

        <span class="chat-colon">:</span>

        <span class="chat-content">
          ${esc(message.content)}
        </span>

      </div>
    `;

    if (!animate) {
      element.style.animation =
        "none";

      element.style.opacity =
        "1";

      element.style.transform =
        "none";
    }

    overlay.appendChild(
      element
    );

    trimDomBuffer();
  }

  function trimDomBuffer() {
    const messages =
      [
        ...overlay.querySelectorAll(
          ".chat-message"
        )
      ];

    while (
      messages.length
      >
      DOM_LIMIT
    ) {
      const oldest =
        messages.shift();

      if (oldest) {
        const id =
          oldest.dataset.messageId;

        if (id) {
          seen.delete(id);
        }

        oldest.remove();
      }
    }
  }

  async function loadInitial() {
    const {
      data,
      error
    } =
      await db
        .from(
          "kick_chat_overlay_messages"
        )
        .select("*")
        .order(
          "received_at",
          {
            ascending:
              false
          }
        )
        .limit(
          DOM_LIMIT
        );

    if (error) {
      console.error(
        "Chat overlay initial:",
        error
      );

      return;
    }

    [...(
      data
      ||
      []
    )]
      .reverse()
      .forEach(
        message =>
          renderMessage(
            message,
            false
          )
      );
  }

  db
    .channel(
      "kick-chat-overlay-v4"
    )
    .on(
      "postgres_changes",
      {
        event:
          "INSERT",

        schema:
          "public",

        table:
          "kick_chat_overlay_messages"
      },
      payload => {
        renderMessage(
          payload.new,
          true
        );
      }
    )
    .subscribe(
      status => {
        console.log(
          "KICK chat realtime:",
          status
        );
      }
    );

  loadInitial();

})();
