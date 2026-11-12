(() => {
  const dateTime = new Intl.DateTimeFormat('cs-CZ', {
    timeZone: 'Europe/Prague', dateStyle: 'medium', timeStyle: 'medium'
  });
  const clock = new Intl.DateTimeFormat('cs-CZ', {
    timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });

  const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');

  function voteCount(value) {
    const count = Number(value);
    return `${count} ${count === 1 ? 'hlas' : count >= 2 && count <= 4 ? 'hlasy' : 'hlasů'}`;
  }

  function winnerLabel(poll) {
    const label = poll.winner_label;
    if (!label) return 'Bez výsledku';
    if (poll.total_votes === 0 || label.startsWith('Remíza: ')) return label;
    return `Vítěz · ${label}`;
  }

  function summary(poll, compact = false) {
    const format = compact ? clock : dateTime;
    return [
      poll.total_votes == null ? '' : `Celkem ${voteCount(poll.total_votes)}`,
      poll.closed_at ? `Uzavřeno ${format.format(new Date(poll.closed_at))}` : ''
    ].filter(Boolean).join(' · ');
  }

  function optionTime(value) {
    if (!value) return 'Bez hlasu';
    const fraction = /\.(\d+)(?:Z|[+-])/.exec(value)?.[1]?.replace(/0+$/, '');
    const time = `${clock.format(new Date(value))}${fraction ? `,${fraction}` : ''}`;
    return `Poslední hlas <time datetime="${escape(value)}">${time}</time>`;
  }

  function renderOptions(options, itemClass) {
    if (options === null) return `<li class="${itemClass} muted">Rozpis odpovědí se nepodařilo načíst.</li>`;
    if (!options.length) return `<li class="${itemClass} muted">K tomuto hlasování nejsou uložené možnosti.</li>`;
    return options.map(option => `
      <li class="${itemClass}">
        <div class="poll-option-title"><span>${escape(option.label)}</span><b>${voteCount(option.votes)}</b></div>
        <div class="poll-option-time">${optionTime(option.last_vote_at)}</div>
      </li>`).join('');
  }

  async function loadOptions(db, polls) {
    if (!polls.length) return new Map();
    const { data, error } = await db.rpc('get_closed_poll_option_results', { p_poll_ids: polls.map(poll => poll.id) });
    if (error) {
      console.error('Uzavřené hlasování:', error);
      return new Map(polls.map(poll => [poll.id, null]));
    }
    const results = new Map(polls.map(poll => [poll.id, []]));
    for (const option of data ?? []) results.get(option.poll_id)?.push(option);
    return results;
  }

  function renderEntry(poll, options) {
    const rows = renderOptions(options, 'poll-history-option');
    return `<strong>${escape(poll.question)}</strong>
      <div class="poll-history-winner">${escape(winnerLabel(poll))}</div>
      <div class="muted">${summary(poll)}</div>
      <ul class="poll-history-options" aria-label="Výsledky odpovědí">${rows}</ul>`;
  }

  window.SVETLONOSI_POLL_HISTORY = { loadOptions, renderEntry, renderOptions, winnerLabel, summary };
})();
