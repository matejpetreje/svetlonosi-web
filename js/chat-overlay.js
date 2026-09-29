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

  /*
   * KLASICKÝ CHAT:
   * - zprávy po zobrazení samy nemizí
   * - nové zprávy přicházejí přes Supabase Realtime
   * - po reloadu Browser Source se NEnačítá celá historie databáze
   * - načte se pouze krátká aktuální historie (default 15 minut)
   *
   * history=0  -> po načtení žádná stará zpráva, jen nové realtime zprávy
   * history=15 -> posledních 15 minut
   * history=30 -> posledních 30 minut
   */

  const HISTORY_MINUTES =
    Math.min(
      180,
      Math.max(
        0,
        Number(
          params.get("history")
          ??
          15
        )
      )
    );

  // Pouze technická ochrana paměti Browser Source.
  // Neurčuje počet zpráv, které jsou vidět v pergamenu.
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


  /*
   * KICK posílá username_color i světlé/neonové.
   * Na světlém pergamenu je zachováme barevně,
   * ale stáhneme jejich jas, aby byly čitelné.
   */
  function darkenKickColor(
    hex
  ) {
    if (
      !/^#[0-9a-fA-F]{6}$/
        .test(
          hex
          ||
          ""
        )
    ) {
      return null;
    }

    const r =
      parseInt(
        hex.slice(
          1,
          3
        ),
        16
      )
      /
      255;

    const g =
      parseInt(
        hex.slice(
          3,
          5
        ),
        16
      )
      /
      255;

    const b =
      parseInt(
        hex.slice(
          5,
          7
        ),
        16
      )
      /
      255;

    const max =
      Math.max(
        r,
        g,
        b
      );

    const min =
      Math.min(
        r,
        g,
        b
      );

    let h = 0;
    let s = 0;

    let l =
      (
        max
        +
        min
      )
      /
      2;

    const d =
      max
      -
      min;

    if (
      d !==
      0
    ) {
      s =
        l > 0.5
          ? d
            /
            (
              2
              -
              max
              -
              min
            )
          : d
            /
            (
              max
              +
              min
            );

      switch (max) {
        case r:
          h =
            (
              g
              -
              b
            )
            /
            d
            +
            (
              g < b
                ? 6
                : 0
            );
          break;

        case g:
          h =
            (
              b
              -
              r
            )
            /
            d
            +
            2;
          break;

        default:
          h =
            (
              r
              -
              g
            )
            /
            d
            +
            4;
          break;
      }

      h /=
        6;
    }

    // Pergamen: držíme lightness mezi 22–34 %.
    l =
      Math.min(
        0.34,
        Math.max(
          0.22,
          l * 0.58
        )
      );

    // U velmi šedých barev trochu zvýšíme sytost,
    // aby nick nezanikl v textu zprávy.
    s =
      Math.max(
        s,
        0.38
      );

    function hueToRgb(
      p,
      q,
      t
    ) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;

      if (t < 1 / 6) {
        return p
          +
          (
            q
            -
            p
          )
          *
          6
          *
          t;
      }

      if (t < 1 / 2) {
        return q;
      }

      if (t < 2 / 3) {
        return p
          +
          (
            q
            -
            p
          )
          *
          (
            2 / 3
            -
            t
          )
          *
          6;
      }

      return p;
    }

    let rr;
    let gg;
    let bb;

    if (s === 0) {
      rr =
        gg =
        bb =
          l;
    } else {
      const q =
        l < 0.5
          ? l
            *
            (
              1
              +
              s
            )
          : l
            +
            s
            -
            l
            *
            s;

      const p =
        2
        *
        l
        -
        q;

      rr =
        hueToRgb(
          p,
          q,
          h
          +
          1 / 3
        );

      gg =
        hueToRgb(
          p,
          q,
          h
        );

      bb =
        hueToRgb(
          p,
          q,
          h
          -
          1 / 3
        );
    }

    const toHex =
      value =>
        Math.round(
          value
          *
          255
        )
          .toString(16)
          .padStart(
            2,
            "0"
          );

    return (
      "#"
      +
      toHex(rr)
      +
      toHex(gg)
      +
      toHex(bb)
    );
  }

  /*
   * chat.message.sent content používá:
   * [emote:ID:NAME]
   *
   * V overlayi token nahradíme skutečným KICK obrázkem.
   */
  function renderKickContent(
    value
  ) {
    const text =
      String(
        value
        ??
        ""
      );

    const pattern =
      /\[emote:(\d+):([^\]]+)\]/g;

    let html =
      "";

    let lastIndex =
      0;

    let match;

    while (
      (
        match =
          pattern.exec(
            text
          )
      )
      !==
      null
    ) {
      html +=
        esc(
          text.slice(
            lastIndex,
            match.index
          )
        );

      const emoteId =
        match[1];

      const emoteName =
        match[2];

      html += `
        <img
          class="kick-emote"
          src="https://files.kick.com/emotes/${encodeURIComponent(emoteId)}/fullsize"
          alt=":${esc(emoteName)}:"
          title="${esc(emoteName)}"
        >
      `;

      lastIndex =
        pattern.lastIndex;
    }

    html +=
      esc(
        text.slice(
          lastIndex
        )
      );

    return html;
  }

  const rankBadgeFallback = {
    "Zbloudilá jiskra":
      "/assets/jiskry/badges/zbloudila-jiskra.png",

    "Jiskra":
      "/assets/jiskry/badges/jiskra.png",

    "Plamínek":
      "/assets/jiskry/badges/plaminek.png",

    "Pochodeň":
      "/assets/jiskry/badges/pochoden.png",

    "Světlonoš":
      "/assets/jiskry/badges/svetlonos.png",

    "Strážce plamene":
      "/assets/jiskry/badges/strazce-plamene.png",

    "Nositel světla":
      "/assets/jiskry/badges/nositel-svetla.png",

    "Věčný plamen":
      "/assets/jiskry/badges/vecny-plamen.png",

    "Maják Světlonošů":
      "/assets/jiskry/badges/majak-svetlonosu.png"
  };

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

    const imageUrl =
      message.jiskry_badge_static_url
      ||
      rankBadgeFallback[
        message.jiskry_badge_name
      ]
      ||
      null;

    if (imageUrl) {
      return `
        <span
          class="chat-jiskry-badge"
          title="${title}"
        >
          <img
            src="${esc(imageUrl)}"
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
        ||
        ""
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
      darkenKickColor(
        message.sender_username_color
      );

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
          ${renderKickContent(message.content)}
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
    // history=0 znamená čistý start:
    // žádná stará zpráva, pouze nové Realtime INSERTy.
    if (
      HISTORY_MINUTES <= 0
    ) {
      return;
    }

    const cutoff =
      new Date(
        Date.now()
        -
        HISTORY_MINUTES
        *
        60
        *
        1000
      )
      .toISOString();

    const {
      data,
      error
    } =
      await db
        .from(
          "kick_chat_overlay_messages"
        )
        .select("*")
        .gte(
          "received_at",
          cutoff
        )
        .order(
          "received_at",
          {
            ascending:
              true
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

    (
      data
      ||
      []
    )
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
      "kick-chat-overlay-live"
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
