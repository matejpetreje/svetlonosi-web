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

  const MAX_MESSAGES =
    Math.min(
      20,
      Math.max(
        1,
        Number(
          params.get("max")
          ||
          10
        )
      )
    );

  const TTL_MS =
    Math.max(
      0,
      Number(
        params.get("ttl")
        ||
        60
      )
      *
      1000
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

  if (
    params.get("line")
    ===
    "1"
  ) {
    document.body.classList.add(
      "one-line"
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

    if (
      message.jiskry_badge_static_url
    ) {
      return `
        <span
          class="chat-jiskry-badge"
          title="${title}"
        >
          <img
            src="${esc(message.jiskry_badge_static_url)}"
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

    trimMessages();

    if (
      TTL_MS > 0
    ) {
      window.setTimeout(
        () =>
          removeMessage(
            element
          ),
        TTL_MS
      );
    }
  }

  function trimMessages() {
    const messages =
      [
        ...overlay.querySelectorAll(
          ".chat-message"
        )
      ];

    while (
      messages.length
      >
      MAX_MESSAGES
    ) {
      const oldest =
        messages.shift();

      if (oldest) {
        oldest.remove();
      }
    }
  }

  function removeMessage(
    element
  ) {
    if (
      !element
      ||
      !element.isConnected
    ) {
      return;
    }

    element.classList.add(
      "is-leaving"
    );

    window.setTimeout(
      () =>
        element.remove(),
      230
    );
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
          MAX_MESSAGES
        );

    if (error) {
      console.error(
        "Chat overlay initial:",
        error
      );

      return;
    }

    const now =
      Date.now();

    [...(
      data
      ||
      []
    )]
      .reverse()
      .forEach(
        message => {
          const age =
            now
            -
            new Date(
              message.received_at
            )
            .getTime();

          if (
            TTL_MS > 0
            &&
            age > TTL_MS
          ) {
            return;
          }

          renderMessage(
            message,
            false
          );

          if (
            TTL_MS > 0
          ) {
            const element =
              overlay.querySelector(
                `[data-message-id="${CSS.escape(String(message.id))}"]`
              );

            if (element) {
              const remaining =
                Math.max(
                  250,
                  TTL_MS - age
                );

              window.setTimeout(
                () =>
                  removeMessage(
                    element
                  ),
                remaining
              );
            }
          }
        }
      );
  }

  db
    .channel(
      "kick-chat-overlay-v2"
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
