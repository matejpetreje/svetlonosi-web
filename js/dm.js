(() => {
  const cfg = window.SVETLONOSI_CONFIG;
  const db = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  let activePoll=null, activeOptions=[], timerHandle=null, editingId=null, currentUser=null;

  function addOption(value=''){
    const n=$('optionInputs').querySelectorAll('input').length;
    if(n>=6)return;
    const wrap=document.createElement('label'); wrap.className='live-field';
    wrap.innerHTML=`<span>Možnost ${String.fromCharCode(65+n)}</span><input maxlength="120" value="${esc(value)}" placeholder="Text možnosti">`;
    $('optionInputs').appendChild(wrap);
  }

  async function verifyDm(user){
    if(!user) return false;
    const {data,error}=await db.rpc('is_dm');
    if(error){ console.error(error); return false; }
    return data === true;
  }

  async function showSession(session){
    currentUser=session?.user ?? null;
    if(!currentUser){ $('loginPanel').hidden=false; $('dmContent').hidden=true; return; }
    const ok=await verifyDm(currentUser);
    if(!ok){
      $('loginMessage').textContent='Tento účet nemá oprávnění Pána hry.';
      await db.auth.signOut(); $('loginPanel').hidden=false; $('dmContent').hidden=true; return;
    }
    $('loginPanel').hidden=true; $('dmContent').hidden=false; $('dmIdentity').textContent=currentUser.email ?? 'DM';
    await loadActive(); await loadHistory();
  }

  async function login(){
    $('loginMessage').textContent='Přihlašuji…';
    const email=$('dmEmail').value.trim(), password=$('dmPassword').value;
    const {data,error}=await db.auth.signInWithPassword({email,password});
    if(error){ $('loginMessage').textContent='Přihlášení se nepodařilo: '+error.message; return; }
    $('loginMessage').textContent=''; await showSession(data.session);
  }

  async function refreshCounts(){
    if(!activePoll)return;
    const {data,error}=await db.rpc('get_poll_results',{p_poll_id:activePoll.id});
    if(error){console.error(error);return;}
    const map=new Map((data??[]).map(r=>[r.option_id,Number(r.votes)]));
    activeOptions=activeOptions.map(o=>({...o,votes:map.get(o.id)??0}));
  }

  function startTimer(){
    clearInterval(timerHandle);
    if(!activePoll?.ends_at){$('timerDisplay').textContent='';return;}
    const tick=async()=>{
      const sec=Math.max(0,Math.ceil((new Date(activePoll.ends_at)-Date.now())/1000));
      $('timerDisplay').textContent=`${sec} s`; $('timerDisplay').classList.toggle('is-warning',sec<=10);
      if(sec<=0){clearInterval(timerHandle);await closePoll(true);}
    };
    tick();timerHandle=setInterval(tick,1000);
  }

  async function loadActive(){
    if(!currentUser)return;
    const {data,error}=await db.from('polls').select('*').eq('status','open').order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(error){console.error(error);return;}
    activePoll=data;
    if(activePoll){const r=await db.from('poll_options').select('*').eq('poll_id',activePoll.id).order('sort_order');activeOptions=r.data??[];await refreshCounts();}
    else activeOptions=[];
    renderActive();startTimer();
  }

  function renderActive(){
    if(!activePoll){$('activeQuestion').textContent='Žádné aktivní hlasování';$('activeResults').innerHTML='';$('timerDisplay').textContent='';['closeVoteButton','cancelVoteButton','hideOverlayButton'].forEach(id=>$(id).disabled=true);return;}
    $('activeQuestion').textContent=activePoll.question;['closeVoteButton','cancelVoteButton','hideOverlayButton'].forEach(id=>$(id).disabled=false);
    const total=activeOptions.reduce((s,o)=>s+(o.votes??0),0);
    $('activeResults').innerHTML=activeOptions.map(o=>{const pct=total?Math.round(o.votes/total*100):0;return `<div class="live-result-row"><div class="live-result-fill" style="width:${pct}%"></div><div class="live-result-content"><strong>${esc(o.label)}</strong><span>${o.votes??0} · ${pct}%</span></div></div>`;}).join('');
  }

  async function createPoll(){
    if(activePoll){$('formMessage').textContent='Nejdřív ukonči nebo zruš aktuální hlasování.';return;}
    const q=$('questionInput').value.trim(); const opts=[...$('optionInputs').querySelectorAll('input')].map(x=>x.value.trim()).filter(Boolean);
    if(!q){$('formMessage').textContent='Vyplň otázku.';return;} if(opts.length<2){$('formMessage').textContent='Zadej alespoň dvě možnosti.';return;}
    $('startVoteButton').disabled=true;
    const {error}=await db.rpc('create_poll_v2',{p_question:q,p_options:opts,p_duration_seconds:Number($('timerSelect').value),p_show_results:$('showResults').checked,p_show_overlay:$('showOverlay').checked});
    $('startVoteButton').disabled=false;
    if(error){console.error(error);$('formMessage').textContent='Chyba: '+error.message;return;}
    $('questionInput').value='';$('optionInputs').innerHTML='';addOption();addOption();addOption();$('formMessage').textContent='Hlasování spuštěno.';await loadActive();
  }

  async function closePoll(fromTimer=false){
    if(!activePoll)return; const id=activePoll.id;
    const {error}=await db.rpc('close_poll_v2',{p_poll_id:id}); if(error){console.error(error);$('formMessage').textContent='Chyba: '+error.message;return;}
    if(!fromTimer)$('formMessage').textContent='Hlasování ukončeno a zapsáno do Kroniky.';await loadActive();await loadHistory();
  }
  async function cancelPoll(){if(!activePoll||!confirm('Opravdu zrušit hlasování bez zápisu do Kroniky?'))return;const {error}=await db.rpc('cancel_poll_v2',{p_poll_id:activePoll.id});if(error){alert(error.message);return;}$('formMessage').textContent='Hlasování zrušeno.';await loadActive();}
  async function hideOverlay(){if(!activePoll)return;const {error}=await db.rpc('set_poll_overlay_visible',{p_poll_id:activePoll.id,p_visible:false});if(error){alert(error.message);return;}$('formMessage').textContent='Overlay skryt.';await loadActive();}

  async function loadHistory(){
    if(!currentUser)return;
    const {data,error}=await db.from('polls').select('id,question,winner_label,total_votes,closed_at').eq('status','closed').order('closed_at',{ascending:false}).limit(30);if(error){console.error(error);return;}
    $('dmHistory').innerHTML=(data??[]).length?data.map(p=>`<div class="live-history-item live-history-manage"><div><strong>${esc(p.question)}</strong><div class="muted">${esc(p.winner_label||'Bez výsledku')}${p.total_votes!=null?` · ${p.total_votes} hlasů`:''}</div></div><div class="live-mini-actions"><button class="btn" data-edit="${p.id}" data-q="${encodeURIComponent(p.question||'')}" data-w="${encodeURIComponent(p.winner_label||'')}">Upravit</button><button class="btn live-danger-outline" data-del="${p.id}">Smazat</button></div></div>`).join(''):'<div class="muted">Kronika je zatím prázdná.</div>';
    $('dmHistory').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{editingId=b.dataset.edit;$('editQuestion').value=decodeURIComponent(b.dataset.q);$('editWinner').value=decodeURIComponent(b.dataset.w);$('editModal').hidden=false;});
    $('dmHistory').querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{if(!confirm('Opravdu chceš tento záznam z Kroniky smazat?'))return;const {error}=await db.rpc('delete_history_entry',{p_poll_id:b.dataset.del});if(error){alert(error.message);return;}await loadHistory();});
  }

  async function saveEdit(){const q=$('editQuestion').value.trim(),w=$('editWinner').value.trim();if(!q){alert('Otázka nesmí být prázdná.');return;}const {error}=await db.rpc('update_history_entry',{p_poll_id:editingId,p_question:q,p_winner_label:w});if(error){alert(error.message);return;}$('editModal').hidden=true;editingId=null;await loadHistory();}

  $('loginButton').onclick=login; $('dmPassword').addEventListener('keydown',e=>{if(e.key==='Enter')login();});
  $('logoutButton').onclick=async()=>{await db.auth.signOut();location.reload();};
  $('addOptionButton').onclick=()=>addOption(); $('startVoteButton').onclick=createPoll; $('closeVoteButton').onclick=()=>closePoll(false); $('cancelVoteButton').onclick=cancelPoll; $('hideOverlayButton').onclick=hideOverlay; $('saveEditButton').onclick=saveEdit; $('cancelEditButton').onclick=()=>{$('editModal').hidden=true;editingId=null;};
  addOption();addOption();addOption();

  db.auth.onAuthStateChange(async (_event,session)=>{await showSession(session);});
  db.channel('dm-live-web').on('postgres_changes',{event:'*',schema:'public',table:'polls'},async()=>{if(currentUser){await loadActive();await loadHistory();}}).on('postgres_changes',{event:'*',schema:'public',table:'votes'},async()=>{if(currentUser){await refreshCounts();renderActive();}}).subscribe(status=>$('connectionState').textContent=status==='SUBSCRIBED'?'Živě připojeno':'Připojuji…');
  db.auth.getSession().then(({data})=>showSession(data.session));
})();
