(() => {
  const cfg = window.SVETLONOSI_CONFIG;
  const db = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const pollHistory = window.SVETLONOSI_POLL_HISTORY;
  const $ = id => document.getElementById(id);
  const overlayCard = $('overlayCard');
  const esc = s => String(s ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;');

  let poll = null;
  let opts = [];
  let timer = null;
  let resultModeUntil = 0;
  let openPollRequest = 0;
  let lastClosedId = '';

  function fitClosedResult() {
    if (!overlayCard.classList.contains('stream-overlay-closed')) return;
    const scale = Math.min(1, window.innerHeight / (overlayCard.offsetHeight + 1));
    overlayCard.style.setProperty('--stream-overlay-scale', scale);
  }

  window.addEventListener('resize', fitClosedResult);
  new ResizeObserver(fitClosedResult).observe(overlayCard);

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
    const pollId = poll.id;

    const { data, error } = await db.rpc('get_poll_results', {
      p_poll_id: pollId
    });
    if (poll?.id !== pollId) return;

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
    overlayCard.classList.remove('stream-overlay-closed');
    overlayCard.style.removeProperty('--stream-overlay-scale');

    const total = opts.reduce((sum, o) => sum + (o.votes ?? 0), 0);

    $('overlayResults').innerHTML = opts.map(o => {
      const pct = total
        ? Math.round(((o.votes ?? 0) / total) * 100)
        : 0;

      // Skrytá procenta = overlay se stále zobrazí HNED.
      // Pouze se nezobrazí procenta a progress bar.
      if (!poll.show_results) {
        return `
          <li class="stream-overlay-result">
            <strong><span>${esc(o.label)}</span></strong>
          </li>
        `;
      }

      return `
        <li class="stream-overlay-result">
          <strong>
            <span>${esc(o.label)}</span>
            <span>${pct}%</span>
          </strong>
          <div class="stream-overlay-bar">
            <div style="width:${pct}%"></div>
          </div>
        </li>
      `;
    }).join('');

    $('overlayCard').classList.remove('stream-overlay-hidden');
    startTimer();
  }

  async function loadOpenPoll() {
    const request = ++openPollRequest;
    const { data, error } = await db
      .from('polls')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (request !== openPollRequest) return;
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

    if (Date.now() < resultModeUntil && data.id === lastClosedId) return;
    poll = data;

    const { data: optionData, error: optionError } = await db
      .from('poll_options')
      .select('*')
      .eq('poll_id', data.id)
      .order('sort_order');

    if (poll?.id !== data.id) return;
    if (optionError) {
      console.error('Overlay options:', optionError);
      return;
    }

    opts = optionData ?? [];
    await refreshResults();
    if (poll?.id === data.id) renderOpenPoll();
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
      !data.overlay_result_until ||
      (poll && new Date(poll.created_at) >= new Date(data.closed_at))
    ) return;

    const until = new Date(data.overlay_result_until).getTime();
    if (until <= Date.now()) return;

    lastClosedId = data.id;

    poll = null;
    opts = [];
    clearInterval(timer);
    resultModeUntil = until;

    $('overlayTitle').textContent = 'ROZHODNUTÍ SBORU';
    $('overlayQuestion').textContent = data.question;
    $('overlayResults').innerHTML = '';
    overlayCard.classList.add('stream-overlay-closed');
    $('overlayTimer').textContent = '';
    $('overlayWinner').textContent = pollHistory.winnerLabel(data);
    $('overlaySub').textContent = pollHistory.summary(data, true);

    fitClosedResult();
    overlayCard.classList.remove('stream-overlay-hidden');

    setTimeout(() => {
      if (lastClosedId !== data.id || resultModeUntil !== until) return;
      resultModeUntil = 0;
      $('overlayCard').classList.add('stream-overlay-hidden');
    }, until - Date.now());

    const results = await pollHistory.loadOptions(db, [data]);
    if (lastClosedId === data.id && resultModeUntil === until && Date.now() < until) {
      $('overlayResults').innerHTML = pollHistory.renderOptions(results.get(data.id), 'stream-overlay-result');
      fitClosedResult();
    }
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
        const pollId = poll.id;
        await refreshResults();
        if (poll?.id === pollId) renderOpenPoll();
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
    const hadOpenPoll = poll !== null;
    await loadOpenPoll();
    if (hadOpenPoll && !poll) await showLatestClosed();
  }, 2000);
})();
