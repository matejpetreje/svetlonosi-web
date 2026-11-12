(() => {
  const cfg = window.SVETLONOSI_CONFIG;
  const db = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const pollHistory = window.SVETLONOSI_POLL_HISTORY;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  let poll = null, opts = [], mine = null, timer = null;
  let historyRequest = 0;

  function voterId(){
    let id = localStorage.getItem('svetlonosi_voter_id');
    if(!id){ id = crypto.randomUUID(); localStorage.setItem('svetlonosi_voter_id', id); }
    return id;
  }

  function startTimer(){
    clearInterval(timer);
    if(!poll?.ends_at){ $('timerDisplay').textContent=''; return; }
    const tick = () => {
      const sec = Math.max(0, Math.ceil((new Date(poll.ends_at) - Date.now()) / 1000));
      $('timerDisplay').textContent = sec ? `${sec} s` : 'Hlasování končí…';
      $('timerDisplay').classList.toggle('is-warning', sec <= 10 && sec > 0);
    };
    tick(); timer = setInterval(tick,1000);
  }

  async function refreshCounts(){
    if(!poll) return;
    const {data,error} = await db.rpc('get_poll_results',{p_poll_id:poll.id});
    if(error){ console.error(error); return; }
    const map = new Map((data ?? []).map(r => [r.option_id, Number(r.votes)]));
    opts = opts.map(o => ({...o, votes:map.get(o.id) ?? 0}));
  }

  async function loadPoll(){
    const {data,error} = await db.from('polls').select('*').eq('status','open').order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(error){ $('connectionState').textContent='Chyba spojení'; console.error(error); return; }
    poll = data;
    if(!poll){ opts=[]; mine=null; render(); startTimer(); return; }
    const [a,b] = await Promise.all([
      db.from('poll_options').select('*').eq('poll_id',poll.id).order('sort_order'),
      db.from('votes').select('option_id').eq('poll_id',poll.id).eq('voter_id',voterId()).maybeSingle()
    ]);
    opts = a.data ?? []; mine = b.data?.option_id ?? null;
    await refreshCounts(); render(); startTimer();
  }

  function render(){
    if(!poll){
      $('question').textContent='Čekáme na další rozhodnutí osudu…';
      $('voteHint').textContent='Jakmile Pán hry otevře hlasování, objeví se zde.';
      $('options').innerHTML=''; $('resultMessage').textContent='';
      return;
    }
    $('question').textContent = poll.question;
    $('voteHint').textContent = mine ? 'Tvůj hlas byl přijat.' : 'Vyber jednu možnost.';
    const total = opts.reduce((s,o)=>s+(o.votes??0),0);
    $('options').innerHTML = opts.map(o => {
      const pct = total ? Math.round(o.votes/total*100) : 0;
      const detail = poll.show_results ? `${o.votes??0} hlasů · ${pct}%${o.id===mine?' · tvůj hlas':''}` : (o.id===mine ? 'Tvůj hlas' : '');
      return `<button class="live-option" data-id="${o.id}" ${mine?'disabled':''}><span>${esc(o.label)}</span>${detail?`<small>${detail}</small>`:''}</button>`;
    }).join('');
    $('options').querySelectorAll('[data-id]').forEach(b => b.onclick=()=>vote(b.dataset.id));
  }

  async function vote(id){
    if(!poll || mine) return;
    $('resultMessage').textContent='Odesílám hlas…';
    const {error} = await db.rpc('cast_vote',{p_poll_id:poll.id,p_option_id:id,p_voter_id:voterId()});
    if(error){ $('resultMessage').textContent='Hlas se nepodařilo odeslat.'; console.error(error); return; }
    mine=id;
    let sparkBonus = 0;
    try {
      const { data: sparkData, error: sparkError } = await db.rpc('award_vote_sparks', { p_poll_id: poll.id });
      if (!sparkError) sparkBonus = Number(sparkData || 0);
    } catch (sparkError) {
      console.warn('Jiskry za hlas se zatím nepodařilo připsat:', sparkError);
    }
    $('resultMessage').textContent = sparkBonus > 0 ? `Hlas přijat. +${sparkBonus} ✦` : 'Hlas přijat.';
    await refreshCounts();
    render();
    if (sparkBonus > 0 && window.SVETLONOSI_ACCOUNT?.refresh) await window.SVETLONOSI_ACCOUNT.refresh();
  }

  async function loadHistory(){
    const request = ++historyRequest;
    const {data,error}=await db.from('polls').select('id,question,winner_label,total_votes,closed_at').eq('status','closed').order('closed_at',{ascending:false}).limit(10);
    if(request !== historyRequest) return;
    if(error){ console.error(error); $('history').textContent='Kroniku se nepodařilo načíst.'; return; }
    const polls = data ?? [];
    const results = await pollHistory.loadOptions(db, polls);
    if(request !== historyRequest) return;
    $('history').innerHTML = polls.length
      ? polls.map(p => `<div class="live-history-item">${pollHistory.renderEntry(p, results.get(p.id))}</div>`).join('')
      : '<div class="muted">Kronika je zatím prázdná.</div>';
  }

  db.channel('public-live-web')
    .on('postgres_changes',{event:'*',schema:'public',table:'polls'},async()=>{await loadPoll();await loadHistory();})
    .on('postgres_changes',{event:'*',schema:'public',table:'votes'},async()=>{await refreshCounts();render();})
    .subscribe(status => $('connectionState').textContent = status==='SUBSCRIBED' ? 'Živě připojeno' : 'Připojuji…');
  loadPoll(); loadHistory();
})();
