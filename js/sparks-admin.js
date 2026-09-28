(() => {
  const cfg = window.SVETLONOSI_CONFIG;
  const db = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const DEFAULT_RULES = [
    {key:'activation',label:'Aktivace účtu + KICK',description:'Jednorázový bonus po prvním propojení KICK účtu.',amount:50,unit:'jednorázově',icon:'✦',sort_order:10,enabled:true},
    {key:'vote',label:'Hlas v anketě',description:'Maximálně jednou za jedno hlasování.',amount:5,unit:'za hlas',icon:'☑',sort_order:20,enabled:true},
    {key:'watch_30m',label:'30 minut na streamu',description:'Za každý ověřený 30min blok účasti.',amount:10,unit:'za 30 min',icon:'◷',sort_order:30,enabled:true},
    {key:'chat_window',label:'Aktivita v KICK chatu',description:'Za aktivní časové okno, ne za každou zprávu.',amount:2,unit:'za okno',icon:'⌁',sort_order:40,enabled:true},
    {key:'all_polls_bonus',label:'Všechna hlasování streamu',description:'Bonus za účast ve všech hlasováních daného streamu.',amount:15,unit:'bonus',icon:'✦',sort_order:50,enabled:true},
    {key:'streak_3',label:'Série 3 streamů',description:'Minimální účast na třech po sobě jdoucích streamech.',amount:25,unit:'bonus',icon:'Ⅲ',sort_order:60,enabled:true},
    {key:'streak_5',label:'Série 5 streamů',description:'Minimální účast na pěti po sobě jdoucích streamech.',amount:50,unit:'bonus',icon:'Ⅴ',sort_order:70,enabled:true},
    {key:'streak_10',label:'Série 10 streamů',description:'Dlouhodobá série pravidelných diváků.',amount:100,unit:'bonus',icon:'Ⅹ',sort_order:80,enabled:true}
  ];

  let rules = [];
  let rewards = [];

  async function isDm() {
    const { data: sessionData } = await db.auth.getSession();
    if (!sessionData.session?.user) return false;
    const { data, error } = await db.rpc('is_dm');
    return !error && data === true;
  }

  function format(n) { return Number(n ?? 0).toLocaleString('cs-CZ'); }

  function renderRules() {
    $('sparkRulesGrid').innerHTML = rules.map(rule => `
      <article class="spark-rule-admin-card" data-rule-key="${esc(rule.key)}">
        <div class="spark-rule-admin-head">
          <span class="spark-rule-admin-icon">${esc(rule.icon || '✦')}</span>
          <label class="spark-switch"><input type="checkbox" data-rule-enabled ${rule.enabled !== false ? 'checked' : ''}><span></span></label>
        </div>
        <strong>${esc(rule.label)}</strong>
        <p>${esc(rule.description || '')}</p>
        <div class="spark-rule-admin-value"><input type="number" step="1" data-rule-amount value="${Number(rule.amount || 0)}"><span>✦</span></div>
        <small>${esc(rule.unit || '')}</small>
      </article>
    `).join('');
  }

  async function ensureDefaults() {
    const { data, error } = await db.from('spark_rules').select('*').order('sort_order');
    if (error) throw error;
    if (data?.length) return data;
    const { error: insertError } = await db.from('spark_rules').insert(DEFAULT_RULES);
    if (insertError) throw insertError;
    return DEFAULT_RULES;
  }

  async function loadRules() {
    try {
      rules = await ensureDefaults();
      renderRules();
      $('sparkRulesMessage').textContent = '';
    } catch (error) {
      console.error(error);
      $('sparkRulesGrid').innerHTML = '<div class="muted">Jiskry zatím nejsou v databázi připravené.</div>';
      $('sparkRulesMessage').textContent = 'Nejdřív spusť SQL soubor supabase/jiskry_v1.sql v Supabase SQL Editoru.';
    }
  }

  async function saveRules() {
    $('saveSparkRulesButton').disabled = true;
    $('sparkRulesMessage').textContent = 'Ukládám…';
    try {
      const updates = [...document.querySelectorAll('[data-rule-key]')].map(card => ({
        key: card.dataset.ruleKey,
        amount: Number(card.querySelector('[data-rule-amount]').value || 0),
        enabled: card.querySelector('[data-rule-enabled]').checked
      }));
      for (const row of updates) {
        const { error } = await db.from('spark_rules').update({ amount: row.amount, enabled: row.enabled }).eq('key', row.key);
        if (error) throw error;
      }
      $('sparkRulesMessage').textContent = 'Bodování Jisker bylo uloženo.';
      await loadRules();
    } catch (error) {
      console.error(error);
      $('sparkRulesMessage').textContent = 'Uložení se nepodařilo: ' + error.message;
    } finally {
      $('saveSparkRulesButton').disabled = false;
    }
  }

  function renderRewards() {
    $('sparkRewardsAdmin').innerHTML = rewards.length ? rewards.map(reward => `
      <div class="spark-reward-admin-row ${reward.enabled === false ? 'is-disabled' : ''}">
        <div class="spark-reward-admin-main">
          <span class="spark-reward-category">${esc(reward.category || 'Odměna')}</span>
          <strong>${esc(reward.name)}</strong>
          <p>${esc(reward.description || '')}</p>
        </div>
        <div class="spark-reward-admin-price">${format(reward.price)} <span>✦</span></div>
        <div class="live-mini-actions">
          <button class="btn" type="button" data-reward-edit="${reward.id}">Upravit</button>
          <button class="btn live-danger-outline" type="button" data-reward-delete="${reward.id}">Smazat</button>
        </div>
      </div>
    `).join('') : '<div class="muted">Zatím nejsou vytvořené žádné odměny.</div>';

    $('sparkRewardsAdmin').querySelectorAll('[data-reward-edit]').forEach(button => button.onclick = () => openRewardModal(rewards.find(r => r.id === button.dataset.rewardEdit)));
    $('sparkRewardsAdmin').querySelectorAll('[data-reward-delete]').forEach(button => button.onclick = () => deleteReward(button.dataset.rewardDelete));
  }

  async function loadRewards() {
    try {
      const { data, error } = await db.from('spark_rewards').select('*').order('sort_order').order('price');
      if (error) throw error;
      rewards = data ?? [];
      renderRewards();
      $('sparkRewardsMessage').textContent = '';
    } catch (error) {
      console.error(error);
      $('sparkRewardsAdmin').innerHTML = '<div class="muted">Odměny zatím nejsou v databázi připravené.</div>';
      $('sparkRewardsMessage').textContent = 'Nejdřív spusť SQL soubor supabase/jiskry_v1.sql v Supabase SQL Editoru.';
    }
  }

  function openRewardModal(reward = null) {
    $('sparkRewardId').value = reward?.id || '';
    $('sparkRewardModalTitle').textContent = reward ? 'Upravit odměnu' : 'Nová odměna';
    $('sparkRewardName').value = reward?.name || '';
    $('sparkRewardDescription').value = reward?.description || '';
    $('sparkRewardPrice').value = reward?.price ?? '';
    $('sparkRewardCategory').value = reward?.category || 'Interakce';
    $('sparkRewardSort').value = reward?.sort_order ?? 100;
    $('sparkRewardEnabled').checked = reward?.enabled !== false;
    $('sparkRewardModal').hidden = false;
  }

  function closeRewardModal() { $('sparkRewardModal').hidden = true; }

  async function saveReward() {
    const payload = {
      name: $('sparkRewardName').value.trim(),
      description: $('sparkRewardDescription').value.trim(),
      price: Number($('sparkRewardPrice').value || 0),
      category: $('sparkRewardCategory').value,
      sort_order: Number($('sparkRewardSort').value || 100),
      enabled: $('sparkRewardEnabled').checked
    };
    if (!payload.name) { $('sparkRewardsMessage').textContent = 'Odměna musí mít název.'; return; }
    if (payload.price < 0) { $('sparkRewardsMessage').textContent = 'Cena nemůže být záporná.'; return; }
    $('saveSparkRewardButton').disabled = true;
    try {
      const id = $('sparkRewardId').value;
      const result = id ? await db.from('spark_rewards').update(payload).eq('id', id) : await db.from('spark_rewards').insert(payload);
      if (result.error) throw result.error;
      closeRewardModal();
      $('sparkRewardsMessage').textContent = 'Odměna byla uložena.';
      await loadRewards();
    } catch (error) {
      console.error(error);
      $('sparkRewardsMessage').textContent = 'Odměnu se nepodařilo uložit: ' + error.message;
    } finally {
      $('saveSparkRewardButton').disabled = false;
    }
  }

  async function deleteReward(id) {
    if (!confirm('Opravdu tuto odměnu smazat?')) return;
    const { error } = await db.from('spark_rewards').delete().eq('id', id);
    if (error) { $('sparkRewardsMessage').textContent = 'Smazání se nepodařilo: ' + error.message; return; }
    $('sparkRewardsMessage').textContent = 'Odměna byla smazána.';
    await loadRewards();
  }

  async function adjustSparks() {
    const kick = $('sparkAdjustKick').value.trim();
    const amount = Number($('sparkAdjustAmount').value || 0);
    const reason = $('sparkAdjustReason').value.trim();
    if (!kick || !amount || !reason) { $('sparkAdjustMessage').textContent = 'Vyplň KICK přezdívku, nenulovou změnu a důvod.'; return; }
    $('sparkAdjustButton').disabled = true;
    $('sparkAdjustMessage').textContent = 'Zapisuji změnu…';
    try {
      const { data, error } = await db.rpc('dm_adjust_sparks', { p_kick_username: kick, p_amount: amount, p_reason: reason });
      if (error) throw error;
      $('sparkAdjustMessage').textContent = `Hotovo. Nový zůstatek: ${format(data?.balance ?? 0)} ✦.`;
      $('sparkAdjustAmount').value = '';
      $('sparkAdjustReason').value = '';
    } catch (error) {
      console.error(error);
      $('sparkAdjustMessage').textContent = 'Změnu se nepodařilo zapsat: ' + error.message;
    } finally {
      $('sparkAdjustButton').disabled = false;
    }
  }

  async function init() {
    if (!(await isDm())) return;
    await Promise.all([loadRules(), loadRewards()]);
  }

  $('saveSparkRulesButton').onclick = saveRules;
  $('sparkAdjustButton').onclick = adjustSparks;
  $('newSparkRewardButton').onclick = () => openRewardModal();
  $('saveSparkRewardButton').onclick = saveReward;
  $('cancelSparkRewardButton').onclick = closeRewardModal;
  $('sparkRewardModal').addEventListener('click', event => { if (event.target === $('sparkRewardModal')) closeRewardModal(); });

  db.auth.onAuthStateChange(async (_event, session) => { if (session?.user) await init(); });
  init();
})();
