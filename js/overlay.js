(() => {
  const cfg = window.SVETLONOSI_CONFIG;
  const db = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;');

  let poll = null;
  let opts = [];
  let timer = null;
  let resultModeUntil = 0;
  let lastClosedId = sessionStorage.getItem('svetlonosi_overlay_last_closed') || '';

  function startTimer() {
    clearInterval(timer);

    if (!poll?.ends_at) {
      $('overlayTimer').textContent = '';
      return;
    }

    const tick = () => {
      const sec = Math.max(
        0,
        Math.ceil((new Date(poll.ends_at).getTime() - Date.now()) / 1000)
      );
      $('overlayTimer').textContent = sec > 0 ? `${sec} s` : '';
    };

    tick();
    timer = setInterval(tick, 1000);
  }

  async function refreshResults() {
    if (!poll) return;

    const { data, error } = await db.rpc('get_poll_results', {
      p_poll_id: poll.id
    });

    if (error) {
      console.error('Overlay results:', error);
      return;
    }

    const map = new Map(
      (data ?? []).map(x => [x.option_id, Number(x.votes)])
    );

    opts = opts.map(o => ({
      ...o,
      votes: map.get(o.id) ?? 0
    }));
  }

  function renderOpenPoll() {
    if (!poll || !poll.overlay_visible) {
      $('overlayCard').classList.add('stream-overlay-hidden');
      return;
    }

    resultModeUntil = 0;

    $('overlayTitle').textContent = 'HLAS SBORU SVĚTLONOŠŮ';
    $('overlayQuestion').textContent = poll.question;
    $('overlayWinner').textContent = '';
    $('overlaySub').textContent = '';

    const total = opts.reduce((sum, o) => sum + (o.votes ?? 0), 0);

    $('overlayResults').innerHTML = opts.map(o => {
      const pct = total
        ? Math.round(((o.votes ?? 0) / total) * 100)
        : 0;

      // Skrytá procenta = overlay se stále zobrazí HNED.
      // Pouze se nezobrazí procenta a progress bar.
      if (!poll.show_results) {
        return `
          <div class="stream-overlay-result">
            <strong><span>${esc(o.label)}</span></strong>
          </div>
        `;
      }

      return `
        <div class="stream-overlay-result">
          <strong>
            <span>${esc(o.label)}</span>
            <span>${pct}%</span>
          </strong>
          <div class="stream-overlay-bar">
            <div style="width:${pct}%"></div>
          </div>
        </div>
      `;
    }).join('');

    $('overlayCard').classList.remove('stream-overlay-hidden');
    startTimer();
  }

  async function loadOpenPoll() {
    const { data, error } = await db
      .from('polls')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Overlay poll:', error);
      return;
    }

    if (!data) {
      poll = null;
      opts = [];
      clearInterval(timer);

      // Výsledek po ukončení necháme doběhnout.
      if (Date.now() < resultModeUntil) return;

      $('overlayCard').classList.add('stream-overlay-hidden');
      return;
    }

    poll = data;

    const { data: optionData, error: optionError } = await db
      .from('poll_options')
      .select('*')
      .eq('poll_id', poll.id)
      .order('sort_order');

    if (optionError) {
      console.error('Overlay options:', optionError);
      return;
    }

    opts = optionData ?? [];
    await refreshResults();
    renderOpenPoll();
  }

  async function showLatestClosed() {
    const { data, error } = await db
      .from('polls')
      .select('*')
      .eq('status', 'closed')
      .order('closed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Overlay closed:', error);
      return;
    }

    if (
      !data ||
      data.id === lastClosedId ||
      !data.overlay_result_until
    ) return;

    const until = new Date(data.overlay_result_until).getTime();
    if (until <= Date.now()) return;

    lastClosedId = data.id;
    sessionStorage.setItem(
      'svetlonosi_overlay_last_closed',
      data.id
    );

    poll = null;
    opts = [];
    clearInterval(timer);
    resultModeUntil = until;

    $('overlayTitle').textContent = 'ROZHODNUTÍ SBORU';
    $('overlayQuestion').textContent = data.question;
    $('overlayResults').innerHTML = '';
    $('overlayTimer').textContent = '';
    $('overlayWinner').textContent = data.winner_label || 'Bez výsledku';
    $('overlaySub').textContent =
      data.total_votes != null ? `${data.total_votes} hlasů` : '';

    $('overlayCard').classList.remove('stream-overlay-hidden');

    setTimeout(() => {
      resultModeUntil = 0;
      $('overlayCard').classList.add('stream-overlay-hidden');
    }, Math.max(1000, until - Date.now()));
  }

  // Realtime.
  db.channel('overlay-web-v3')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'polls' },
      async payload => {
        if (payload.new?.status === 'closed') {
          await showLatestClosed();
          return;
        }

        // create_poll nejprve vytvoří poll a potom možnosti.
        // Krátké zpoždění zajistí, že už jsou poll_options dostupné.
        setTimeout(loadOpenPoll, 180);
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'votes' },
      async () => {
        if (!poll) {
          await loadOpenPoll();
          return;
        }
        await refreshResults();
        renderOpenPoll();
      }
    )
    .subscribe();

  loadOpenPoll();
  showLatestClosed();

  // OBS / embedded Chromium občas mine realtime INSERT událost.
  // Záložní synchronizace zaručí zobrazení nejpozději do 2 sekund,
  // i když ještě nikdo nehlasoval.
  setInterval(async () => {
    if (Date.now() < resultModeUntil) return;
    await loadOpenPoll();
  }, 2000);
})();
