begin;

-- A close waits for votes already being accepted. New votes wait for the close
-- and are rejected if the poll closed while they were waiting.
create or replace function public.lock_open_poll_for_vote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
  from public.polls
  where id = new.poll_id and status = 'open'
  for share;

  if not found then
    raise exception 'Hlasování už není otevřené.';
  end if;

  return new;
end;
$$;

revoke execute on function public.lock_open_poll_for_vote() from public;

drop trigger if exists lock_open_poll_for_vote on public.votes;
create trigger lock_open_poll_for_vote
before insert on public.votes
for each row execute function public.lock_open_poll_for_vote();

create or replace function public.resolve_poll_close_result()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  finalist_count integer;
  finalist_labels text;
  top_vote_count integer;
  total_vote_count integer;
begin
  -- Two DM panels can try to close the same poll at the same time.
  if old.status = 'closed' then
    return null;
  end if;

  with option_tallies as (
    select opt.id, opt.label, opt.sort_order,
           count(*) as vote_count, max(vote.created_at) as reached_at
    from public.poll_options as opt
    join public.votes as vote
      on vote.poll_id = opt.poll_id and vote.option_id = opt.id
    where opt.poll_id = new.id
    group by opt.id, opt.label, opt.sort_order
  ), ranked as (
    select *, sum(vote_count) over () as total_votes,
           dense_rank() over (order by vote_count desc, reached_at asc nulls last) as place
    from option_tallies
  )
  select count(*), string_agg(label, ' / ' order by sort_order, id),
         max(vote_count), max(total_votes)
  into finalist_count, finalist_labels, top_vote_count, total_vote_count
  from ranked
  where place = 1;

  if finalist_count = 0 then
    return new;
  end if;

  if finalist_count = 1 then
    new.winner_label := finalist_labels;
  else
    new.winner_label := 'Remíza: ' || finalist_labels;
  end if;

  -- The closing RPC can have counted before a concurrent vote committed.
  if total_vote_count is distinct from new.total_votes then
    new.total_votes := total_vote_count;
    new.winner_votes := top_vote_count;
    new.winner_pct := round(100.0 * top_vote_count / total_vote_count);
  end if;

  return new;
end;
$$;

revoke execute on function public.resolve_poll_close_result() from public;

drop trigger if exists resolve_poll_close_result on public.polls;
create trigger resolve_poll_close_result
before update of status on public.polls
for each row
when (new.status = 'closed' and old.status in ('open', 'closed'))
execute function public.resolve_poll_close_result();

commit;
