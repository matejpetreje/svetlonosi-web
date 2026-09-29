(() => {

  const cfg = window.SVETLONOSI_CONFIG;

  if (!cfg || !window.supabase) {
    return;
  }


  /* =========================================================
     SUPABASE
     ========================================================= */

  const db = supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_ANON_KEY
  );


  let currentSession = null;
  let currentProfile = null;

  let pendingProtectedUrl = null;
  let requiredLoginLabel = null;

  const PROTECTED_ROUTES = [
    { path: "/jiskry/sin-slavy/", label: "Síň slávy" },
    { path: "/jiskry/obchod/", label: "Obchod Jisker" },
    { path: "/jiskry/inventar/", label: "Inventář" },
    { path: "/jiskry/profil/", label: "Veřejný profil" }
  ];

  function protectedRouteForUrl(value) {
    try {
      const url = new URL(value, window.location.href);

      if (url.origin !== window.location.origin) {
        return null;
      }

      return PROTECTED_ROUTES.find(item =>
        url.pathname === item.path ||
        url.pathname.startsWith(item.path)
      ) || null;
    } catch (_) {
      return null;
    }
  }



  /* =========================================================
     ACCOUNT BUTTON
     ========================================================= */

  function injectAccountButton() {

    document
      .querySelectorAll("header .nav")
      .forEach(navWrap => {

        const nav =
          navWrap.querySelector("nav");


        /*
          DESKTOP
        */

        if (
          nav &&
          !nav.querySelector(
            "[data-account-open]"
          )
        ) {

          const button =
            document.createElement(
              "button"
            );

          button.type =
            "button";

          button.className =
            "nav-account-button";

          button.dataset.accountOpen =
            "";

          button.innerHTML = `
            <span class="nav-wallet-chip" data-account-wallet hidden>
              <span class="nav-account-spark">✦</span>
              <strong data-account-wallet-balance>0</strong>
            </span>

            <span class="nav-account-name" data-account-label>
              Zapojit se
            </span>
          `;

          nav.appendChild(
            button
          );

        }


        /*
          MOBILE
        */

        if (
          !navWrap.querySelector(
            ".nav-account-mobile"
          )
        ) {

          const mobile =
            document.createElement(
              "button"
            );

          mobile.type =
            "button";

          mobile.className =
            "nav-account-button nav-account-mobile";

          mobile.dataset.accountOpen =
            "";

          mobile.innerHTML = `
            <span class="nav-wallet-chip" data-account-wallet hidden>
              <span class="nav-account-spark">✦</span>
              <strong data-account-wallet-balance>0</strong>
            </span>

            <span class="nav-account-name" data-account-label>
              Zapojit se
            </span>
          `;

          navWrap.appendChild(
            mobile
          );

        }

      });

  }



  /* =========================================================
     ACCOUNT MODAL
     ========================================================= */

  function injectModal() {

    if (
      document.getElementById(
        "accountModal"
      )
    ) {
      return;
    }


    document.body.insertAdjacentHTML(
      "beforeend",
      `

      <div
        class="account-modal-backdrop"
        id="accountModal"
        hidden
      >

        <div
          class="account-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="accountModalTitle"
        >

          <button
            class="account-close"
            type="button"
            id="accountCloseButton"
            aria-label="Zavřít"
          >
            ×
          </button>


          <!-- =========================
               HEADER
               ========================= -->

          <div class="account-brand-row">

            <span
              class="spark-emblem spark-emblem-sm"
              aria-hidden="true"
            >
              <span>
                ✦
              </span>
            </span>


            <div>

              <div class="live-kicker">
                Světlonošský účet
              </div>

              <h2 id="accountModalTitle">
                Tvoje Jiskra
              </h2>

            </div>

          </div>



          <!-- =========================
               NEPŘIHLÁŠENÝ
               ========================= -->

          <div id="accountSignedOut">


            <p class="muted" id="accountSignedOutText">

              Přihlas se pomocí svého KICK účtu.

              Přezdívku a identitu převezmeme přímo
              z KICKu a Jiskry budou navázané na tento účet.

            </p>


            <button
              class="btn primary account-full-button"
              type="button"
              id="accountKickLoginButton"
            >
              Přihlásit se přes KICK
            </button>


            <div
              id="accountAuthMessage"
              class="live-message"
            ></div>


          </div>



          <!-- =========================
               PŘIHLÁŠENÝ
               ========================= -->

          <div
            id="accountSignedIn"
            hidden
          >


            <!-- PROFIL -->

            <div class="account-profile-card">


              <div
                class="account-avatar"
                id="accountAvatar"
              >
                ✦
              </div>


              <div class="account-profile-copy">

                <strong
                  id="accountDisplayName"
                >
                  Světlonoš
                </strong>

                <span
                  id="accountKickName"
                  class="muted"
                ></span>

              </div>


              <div class="account-balance">

                <strong
                  id="accountBalance"
                >
                  0
                </strong>

                <span>
                  ✦
                </span>

              </div>


            </div>



            <!-- KICK CONNECTED -->

            <div
              class="account-kick-card is-connected"
            >

              <div>

                <strong>
                  KICK propojen
                </strong>

                <p class="muted">
                  Tvoje přezdívka a účet Jisker
                  jsou navázané na KICK.
                </p>

              </div>


              <span class="account-ok">
                ✓
              </span>

            </div>



            <!-- ACTIONS -->

            <div class="account-actions-row">

              <a
                class="btn"
                href="/jiskry/"
              >
                Moje Jiskry
              </a>

              <a
                class="btn"
                href="/jiskry/obchod/"
              >
                Obchod
              </a>

              <a
                class="btn"
                href="/jiskry/inventar/"
              >
                Inventář
              </a>

              <button
                class="btn live-danger-outline"
                type="button"
                id="accountLogoutButton"
              >
                Odhlásit se
              </button>

            </div>


            <div
              id="accountProfileMessage"
              class="live-message"
            ></div>


          </div>


        </div>

      </div>

      `
    );

  }



  /* =========================================================
     MODAL
     ========================================================= */

  function setSignedOutModalCopy(
    title = "Tvoje Jiskra",
    text = "Přihlas se pomocí svého KICK účtu. Přezdívku a identitu převezmeme přímo z KICKu a Jiskry budou navázané na tento účet."
  ) {
    const titleEl =
      document.getElementById(
        "accountModalTitle"
      );

    const textEl =
      document.getElementById(
        "accountSignedOutText"
      );

    if (titleEl) {
      titleEl.textContent =
        title;
    }

    if (textEl) {
      textEl.textContent =
        text;
    }
  }

  function openModal() {
    pendingProtectedUrl =
      null;

    requiredLoginLabel =
      null;

    setSignedOutModalCopy();

    const modal =
      document.getElementById(
        "accountModal"
      );

    if (modal) {
      modal.hidden =
        false;
    }
  }

  function openRequiredLogin(
    targetUrl = window.location.href,
    label = "tato část webu"
  ) {
    pendingProtectedUrl =
      new URL(
        targetUrl,
        window.location.href
      ).href;

    requiredLoginLabel =
      label;

    setSignedOutModalCopy(
      "Přihlášení je potřeba",
      `${label} je dostupná jen po přihlášení přes KICK.`
    );

    const modal =
      document.getElementById(
        "accountModal"
      );

    if (modal) {
      modal.hidden =
        false;
    }
  }



  function closeModal() {

    const modal =
      document.getElementById(
        "accountModal"
      );

    if (modal) {
      modal.hidden =
        true;
    }

  }



  /* =========================================================
     LOAD PROFILE
     ========================================================= */

  async function loadProfile(
    user
  ) {

    if (!user) {
      return null;
    }


    const {
      data,
      error
    } =
      await db

        .from(
          "spark_profiles"
        )

        .select("*")

        .eq(
          "user_id",
          user.id
        )

        .maybeSingle();


    if (error) {

      console.warn(
        "Profil Jisker nelze načíst:",
        error.message
      );

      return null;
    }


    return data || null;

  }



  /* =========================================================
     NAV LABEL
     ========================================================= */

  function updateNavigationAccountLabel() {

    const loggedIn =
      !!(
        currentSession?.user
        &&
        currentProfile?.kick_user_id
      );

    const displayName =
      currentProfile?.kick_display_name
      ||
      currentProfile?.kick_username
      ||
      "Světlonoš";

    const balance =
      Number(
        currentProfile?.balance
        ??
        0
      )
      .toLocaleString(
        "cs-CZ"
      );

    document
      .querySelectorAll(
        "[data-account-label]"
      )
      .forEach(label => {

        label.textContent =
          loggedIn
            ? displayName
            : "Zapojit se";

      });

    document
      .querySelectorAll(
        "[data-account-wallet]"
      )
      .forEach(wallet => {

        wallet.hidden =
          !loggedIn;

      });

    document
      .querySelectorAll(
        "[data-account-wallet-balance]"
      )
      .forEach(value => {

        value.textContent =
          balance;

      });

  }



  function accountBadgeMarkup(
    badge
  ) {

    if (!badge) {
      return "";
    }

    if (
      badge.preview_static_url
    ) {

      return `
        <span
          class="profile-badge-overlay profile-badge-overlay-account"
          title="${badge.variant_name || "Odznak"}"
        >
          <img
            class="profile-badge-image"
            src="${badge.preview_static_url}"
            alt=""
          >
        </span>
      `;

    }

    return `
      <span
        class="profile-badge-overlay profile-badge-overlay-account"
        title="${badge.variant_name || "Odznak"}"
      >
        <span class="profile-badge-glyph spark-accent-${badge.accent_key || "gold"}">
          ${badge.preview_glyph || "✦"}
        </span>
      </span>
    `;

  }


  async function refreshAccountBadge() {

    const avatar =
      document.getElementById(
        "accountAvatar"
      );

    if (!avatar) {
      return;
    }

    avatar
      .querySelector(
        ".profile-badge-overlay"
      )
      ?.remove();

    if (
      !currentSession?.user
      ||
      !currentProfile?.kick_username
    ) {
      return;
    }

    const {
      data,
      error
    } =
      await db.rpc(
        "spark_profile_equipped",
        {
          p_username:
            currentProfile.kick_username
        }
      );

    if (error) {
      console.warn(
        "Aktivní odznak účtu se nepodařilo načíst:",
        error.message
      );
      return;
    }

    const badge =
      (data || [])
        .find(
          item =>
            item.slot_type ===
            "badge"
        );

    if (!badge) {
      return;
    }

    avatar.insertAdjacentHTML(
      "beforeend",
      accountBadgeMarkup(
        badge
      )
    );

  }



  /* =========================================================
     REFRESH ACCOUNT UI
     ========================================================= */

  async function refreshAccountUi(
    session
  ) {

    currentSession =
      session ?? null;


    currentProfile =

      currentSession?.user

        ? await loadProfile(
            currentSession.user
          )

        : null;



    /*
      Účet považujeme za aktivní jen pokud:

      - existuje Supabase session
      - profil má KICK user ID
    */

    const activeKickAccount =

      !!currentSession?.user

      &&

      !!currentProfile?.kick_user_id;



    updateNavigationAccountLabel();



    const signedOut =
      document.getElementById(
        "accountSignedOut"
      );


    const signedIn =
      document.getElementById(
        "accountSignedIn"
      );


    if (
      !signedOut ||
      !signedIn
    ) {

      return;
    }



    signedOut.hidden =
      activeKickAccount;


    signedIn.hidden =
      !activeKickAccount;



    /* =====================================================
       NEPŘIHLÁŠENÝ
       ===================================================== */

    if (
      !activeKickAccount
    ) {

      window.dispatchEvent(

        new CustomEvent(
          "svetlonosi-account-changed",
          {

            detail: {

              session:
                currentSession,

              profile:
                currentProfile

            }

          }
        )

      );


      return;

    }



    /* =====================================================
       PŘIHLÁŠENÝ
       ===================================================== */

    const displayName =

      currentProfile
        .kick_display_name

      ||

      currentProfile
        .kick_username

      ||

      "Světlonoš";



    document
      .getElementById(
        "accountDisplayName"
      )
      .textContent =
        displayName;



    document
      .getElementById(
        "accountKickName"
      )
      .textContent =

        `@${
          currentProfile.kick_username
          ||
          displayName
        }`;



    document
      .getElementById(
        "accountBalance"
      )
      .textContent =

        Number(
          currentProfile.balance ??
          0
        )
        .toLocaleString(
          "cs-CZ"
        );



    /* =====================================================
       AVATAR
       ===================================================== */

    const avatar =
      document.getElementById(
        "accountAvatar"
      );


    if (
      currentProfile
        .kick_avatar_url
    ) {

      avatar.innerHTML = `

        <img
          src="${currentProfile.kick_avatar_url}"
          alt=""
          referrerpolicy="no-referrer"
        >

      `;

    }

    else {

      avatar.textContent =

        (
          displayName
            .trim()[0]

          ||

          "✦"
        )
        .toUpperCase();

    }



    refreshAccountBadge();



    /* =====================================================
       EVENT
       ===================================================== */

    window.dispatchEvent(

      new CustomEvent(
        "svetlonosi-account-changed",
        {

          detail: {

            session:
              currentSession,

            profile:
              currentProfile

          }

        }
      )

    );

  }



  /* =========================================================
     START KICK LOGIN
     ========================================================= */

  async function startKickLogin() {

    const message =
      document.getElementById(
        "accountAuthMessage"
      );


    if (message) {

      message.textContent =
        "Přesměrovávám na KICK…";

    }


    try {


      const {
        data,
        error
      } =

        await db.functions.invoke(

          "kick-jiskry-user",

          {

            body: {

              action:
                "start_login",

              return_to:
                pendingProtectedUrl
                ||
                window.location.href

            }

          }

        );



      if (error) {

        throw error;

      }



      if (
        !data?.authorization_url
      ) {

        throw new Error(
          "KICK přihlášení nevrátilo autorizační adresu."
        );

      }



      /*
        REDIRECT NA KICK
      */

      window.location.href =
        data.authorization_url;

    }

    catch (
      error
    ) {


      console.error(
        error
      );


      if (message) {

        message.textContent =

          "KICK přihlášení se nepodařilo: "

          +

          (
            error?.message
            ||
            String(error)
          );

      }

    }

  }



  /* =========================================================
     LOGOUT
     ========================================================= */

  async function logout() {

    await db.auth.signOut();


    currentSession =
      null;


    currentProfile =
      null;


    await refreshAccountUi(
      null
    );


    closeModal();

  }



  /* =========================================================
     UI EVENTS
     ========================================================= */

  function bindUi() {


    document.addEventListener(

      "click",

      event => {


        /*
          CHRÁNĚNÉ ODKAZY
        */

        const protectedAnchor =
          event.target.closest(
            "a[href]"
          );

        if (
          protectedAnchor
          &&
          !currentSession?.user
        ) {
          const route =
            protectedRouteForUrl(
              protectedAnchor.href
            );

          if (route) {
            event.preventDefault();
            event.stopPropagation();

            openRequiredLogin(
              protectedAnchor.href,
              route.label
            );

            return;
          }
        }


        /*
          OPEN ACCOUNT
        */

        const trigger =

          event.target.closest(
            "[data-account-open]"
          );


        if (trigger) {

          event.preventDefault();

          openModal();

        }



        /*
          CLICK BACKDROP
        */

        if (
          event.target.id ===
          "accountModal"
        ) {

          closeModal();

        }

      }

    );



    /* CLOSE */

    document
      .getElementById(
        "accountCloseButton"
      )
      .onclick =
        closeModal;



    /* KICK LOGIN */

    document
      .getElementById(
        "accountKickLoginButton"
      )
      .onclick =
        startKickLogin;



    /* LOGOUT */

    document
      .getElementById(
        "accountLogoutButton"
      )
      .onclick =
        logout;

  }



  /* =========================================================
     INIT
     ========================================================= */

  async function init() {


    injectAccountButton();


    injectModal();


    bindUi();



    /* =====================================================
       CURRENT SESSION
       ===================================================== */

    const {
      data
    } =
      await db.auth
        .getSession();


    await refreshAccountUi(
      data.session
    );


    if (
      !data.session?.user
    ) {
      const currentProtected =
        protectedRouteForUrl(
          window.location.href
        );

      if (currentProtected) {
        openRequiredLogin(
          window.location.href,
          currentProtected.label
        );
      }
    }



    /* =====================================================
       SESSION CHANGE
       ===================================================== */

    db.auth.onAuthStateChange(

      async (
        _event,
        session
      ) => {

        await refreshAccountUi(
          session
        );

      }

    );



    /* =====================================================
       CLEAN CALLBACK URL
       ===================================================== */

    const url =
      new URL(
        window.location.href
      );


    if (
      url.searchParams.get(
        "kick"
      ) ===
      "connected"
    ) {

      url.searchParams.delete(
        "kick"
      );


      window.history.replaceState(

        {},

        "",

        url.pathname
        +
        url.search
        +
        url.hash

      );

    }

  }



  /* =========================================================
     PUBLIC API
     ========================================================= */

  window.SVETLONOSI_ACCOUNT = {


    open:
      openModal,


    openRequired:
      openRequiredLogin,


    bindOpenButtons:
      () => {},


    getSession:
      () =>
        currentSession,


    getProfile:
      () =>
        currentProfile,


    refresh:
      async () => {

        const {
          data
        } =
          await db.auth
            .getSession();


        return refreshAccountUi(
          data.session
        );

      },


    loginWithKick:
      startKickLogin

  };



  /* =========================================================
     START
     ========================================================= */

  init();

})();
