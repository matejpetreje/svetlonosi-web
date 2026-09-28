(() => {
  const cfg = window.SVETLONOSI_CONFIG;
  if (!cfg || !window.supabase) return;

  const db = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  let currentSession = null;
  let currentProfile = null;

  function injectAccountButton() {
    document.querySelectorAll('header .nav').forEach(navWrap => {
      const nav = navWrap.querySelector('nav');
      if (nav && !nav.querySelector('[data-account-open]')) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nav-account-button';
        btn.dataset.accountOpen = '';
        btn.innerHTML = '<span class="nav-account-spark">✦</span><span data-account-label>Přihlásit se</span>';
        nav.appendChild(btn);
      }
      if (!navWrap.querySelector('.nav-account-mobile')) {
        const mobile = document.createElement('button');
        mobile.type = 'button';
        mobile.className = 'nav-account-button nav-account-mobile';
        mobile.dataset.accountOpen = '';
        mobile.innerHTML = '<span class="nav-account-spark">✦</span><span data-account-label>Přihlásit se</span>';
        navWrap.appendChild(mobile);
      }
    });
  }

  function injectModal() {
    if (document.getElementById('accountModal')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <div class="account-modal-backdrop" id="accountModal" hidden>
        <div class="account-modal" role="dialog" aria-modal="true" aria-labelledby="accountModalTitle">
          <button class="account-close" type="button" id="accountCloseButton" aria-label="Zavřít">×</button>
          <div class="account-brand-row">
            <span class="spark-emblem spark-emblem-sm" aria-hidden="true"><span>✦</span></span>
            <div><div class="live-kicker">Světlonošský účet</div><h2 id="accountModalTitle">Tvoje Jiskra</h2></div>
          </div>

          <div id="accountSignedOut">
            <p class="muted">Vytvoř si účet nebo se přihlas. Pro sbírání Jisker bude následně potřeba propojit KICK.</p>
            <div class="account-tabs">
              <button type="button" class="account-tab is-active" data-account-tab="login">Přihlášení</button>
              <button type="button" class="account-tab" data-account-tab="register">Registrace</button>
            </div>
            <div class="account-tab-panel" data-account-panel="login">
              <label class="live-field"><span>E-mail</span><input type="email" id="accountLoginEmail" autocomplete="email"></label>
              <label class="live-field"><span>Heslo</span><input type="password" id="accountLoginPassword" autocomplete="current-password"></label>
              <button class="btn primary account-full-button" type="button" id="accountLoginButton">Přihlásit se</button>
            </div>
            <div class="account-tab-panel" data-account-panel="register" hidden>
              <label class="live-field"><span>E-mail</span><input type="email" id="accountRegisterEmail" autocomplete="email"></label>
              <label class="live-field"><span>Heslo</span><input type="password" id="accountRegisterPassword" autocomplete="new-password" minlength="6"></label>
              <button class="btn primary account-full-button" type="button" id="accountRegisterButton">Vytvořit účet</button>
            </div>
            <div id="accountAuthMessage" class="live-message"></div>
          </div>

          <div id="accountSignedIn" hidden>
            <div class="account-profile-card">
              <div class="account-avatar" id="accountAvatar">✦</div>
              <div class="account-profile-copy">
                <strong id="accountDisplayName">Světlonoš</strong>
                <span id="accountEmail" class="muted"></span>
              </div>
              <div class="account-balance"><strong id="accountBalance">0</strong><span>✦</span></div>
            </div>

            <div id="accountKickMissing" class="account-kick-card">
              <div><strong>Propoj KICK účet</strong><p class="muted">KICK je povinný pro aktivaci Jisker a určuje tvoji veřejnou přezdívku.</p></div>
              <button class="btn primary" type="button" id="accountKickConnectButton">Propojit KICK</button>
            </div>

            <div id="accountKickConnected" class="account-kick-card is-connected" hidden>
              <div><strong>KICK propojen</strong><p id="accountKickName" class="muted"></p></div>
              <span class="account-ok">✓</span>
            </div>

            <div class="account-actions-row">
              <a class="btn" href="/jiskry/">Moje Jiskry</a>
              <button class="btn live-danger-outline" type="button" id="accountLogoutButton">Odhlásit se</button>
            </div>
            <div id="accountProfileMessage" class="live-message"></div>
          </div>
        </div>
      </div>
    `);
  }

  function setTab(name) {
    document.querySelectorAll('[data-account-tab]').forEach(button => button.classList.toggle('is-active', button.dataset.accountTab === name));
    document.querySelectorAll('[data-account-panel]').forEach(panel => panel.hidden = panel.dataset.accountPanel !== name);
  }

  function openModal() {
    const modal = document.getElementById('accountModal');
    if (modal) modal.hidden = false;
  }

  function closeModal() {
    const modal = document.getElementById('accountModal');
    if (modal) modal.hidden = true;
  }

  async function ensureProfile(user) {
    if (!user) return null;
    let { data, error } = await db.from('spark_profiles').select('*').eq('user_id', user.id).maybeSingle();
    if (error && error.code !== 'PGRST116') {
      console.warn('spark_profiles není zatím připravené:', error.message);
      return null;
    }
    if (!data) {
      const inserted = await db.from('spark_profiles').insert({ user_id: user.id }).select('*').maybeSingle();
      if (inserted.error) {
        console.warn('Profil Jisker nebylo možné vytvořit:', inserted.error.message);
        return null;
      }
      data = inserted.data;
    }
    return data;
  }

  async function refreshAccountUi(session) {
    currentSession = session ?? null;
    currentProfile = currentSession?.user ? await ensureProfile(currentSession.user) : null;

    document.querySelectorAll('[data-account-label]').forEach(label => {
      if (!currentSession?.user) label.textContent = 'Přihlásit se';
      else if (currentProfile?.kick_display_name || currentProfile?.kick_username) label.textContent = currentProfile.kick_display_name || currentProfile.kick_username;
      else label.textContent = 'Dokončit účet';
    });

    const signedOut = document.getElementById('accountSignedOut');
    const signedIn = document.getElementById('accountSignedIn');
    if (!signedOut || !signedIn) return;

    signedOut.hidden = !!currentSession?.user;
    signedIn.hidden = !currentSession?.user;

    if (!currentSession?.user) {
      window.dispatchEvent(new CustomEvent('svetlonosi-account-changed', { detail: { session: null, profile: null } }));
      return;
    }

    const user = currentSession.user;
    const display = currentProfile?.kick_display_name || currentProfile?.kick_username || 'Účet čeká na KICK';
    document.getElementById('accountDisplayName').textContent = display;
    document.getElementById('accountEmail').textContent = user.email ?? '';
    document.getElementById('accountBalance').textContent = Number(currentProfile?.balance ?? 0).toLocaleString('cs-CZ');
    document.getElementById('accountAvatar').textContent = (display.trim()[0] || '✦').toUpperCase();

    const connected = !!currentProfile?.kick_user_id;
    document.getElementById('accountKickMissing').hidden = connected;
    document.getElementById('accountKickConnected').hidden = !connected;
    document.getElementById('accountKickName').textContent = connected ? `@${currentProfile.kick_username || currentProfile.kick_display_name || 'KICK'}` : '';

    window.dispatchEvent(new CustomEvent('svetlonosi-account-changed', { detail: { session: currentSession, profile: currentProfile } }));
  }

  async function login() {
    const msg = document.getElementById('accountAuthMessage');
    msg.textContent = 'Přihlašuji…';
    const email = document.getElementById('accountLoginEmail').value.trim();
    const password = document.getElementById('accountLoginPassword').value;
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) { msg.textContent = 'Přihlášení se nepodařilo: ' + error.message; return; }
    msg.textContent = '';
    await refreshAccountUi(data.session);
  }

  async function register() {
    const msg = document.getElementById('accountAuthMessage');
    msg.textContent = 'Zakládám účet…';
    const email = document.getElementById('accountRegisterEmail').value.trim();
    const password = document.getElementById('accountRegisterPassword').value;
    const { data, error } = await db.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + '/jiskry/' } });
    if (error) { msg.textContent = 'Registrace se nepodařila: ' + error.message; return; }
    if (data.session) {
      msg.textContent = '';
      await refreshAccountUi(data.session);
    } else {
      msg.textContent = 'Účet je vytvořený. Zkontroluj e-mail a potvrď registraci.';
    }
  }

  async function connectKick() {
    const msg = document.getElementById('accountProfileMessage');
    msg.textContent = 'Připravuji propojení s KICKem…';
    try {
      const { data, error } = await db.functions.invoke('kick-user', {
        body: { action: 'start_oauth', return_to: location.href }
      });
      if (error) throw error;
      if (!data?.authorization_url) throw new Error('Služba KICK propojení nevrátila autorizační adresu.');
      location.href = data.authorization_url;
    } catch (error) {
      console.error(error);
      msg.textContent = 'KICK propojení ještě není nasazené nebo odpovědělo chybou: ' + error.message;
    }
  }

  async function logout() {
    await db.auth.signOut();
    closeModal();
  }

  function bindUi() {
    document.addEventListener('click', event => {
      const trigger = event.target.closest('[data-account-open]');
      if (trigger) { event.preventDefault(); openModal(); }
      if (event.target.id === 'accountModal') closeModal();
    });
    document.getElementById('accountCloseButton').onclick = closeModal;
    document.querySelectorAll('[data-account-tab]').forEach(button => button.onclick = () => setTab(button.dataset.accountTab));
    document.getElementById('accountLoginButton').onclick = login;
    document.getElementById('accountRegisterButton').onclick = register;
    document.getElementById('accountKickConnectButton').onclick = connectKick;
    document.getElementById('accountLogoutButton').onclick = logout;
    document.getElementById('accountLoginPassword').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
    document.getElementById('accountRegisterPassword').addEventListener('keydown', e => { if (e.key === 'Enter') register(); });
  }

  async function init() {
    injectAccountButton();
    injectModal();
    bindUi();
    const { data } = await db.auth.getSession();
    await refreshAccountUi(data.session);
    db.auth.onAuthStateChange(async (_event, session) => { await refreshAccountUi(session); });
  }

  window.SVETLONOSI_ACCOUNT = {
    open: openModal,
    getSession: () => currentSession,
    getProfile: () => currentProfile,
    refresh: async () => refreshAccountUi((await db.auth.getSession()).data.session)
  };

  init();
})();
