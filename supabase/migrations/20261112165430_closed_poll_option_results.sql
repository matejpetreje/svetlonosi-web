create schema if not exists poll_history_private;
revoke all on schema poll_history_private from public;
grant usage on schema poll_history_private to anon, authenticated;

-- Only closed polls are public. Return one aggregate row per option, with no voter data.
create or replace function poll_history_private.closed_poll_option_results(p_poll_ids uuid[])
returns table(poll_id uuid, option_id uuid, label text, sort_order integer, votes bigint, last_vote_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select p.id, o.id, o.label, o.sort_order, count(v.id), max(v.created_at)
  from public.polls p
  join public.poll_options o on o.poll_id = p.id
  left join public.votes v on v.option_id = o.id
  where p.status = 'closed'
    and cardinality(p_poll_ids) between 1 and 30
    and p.id = any(p_poll_ids)
  group by p.id, o.id, o.label, o.sort_order;
$$;

revoke execute on function poll_history_private.closed_poll_option_results(uuid[]) from public;
grant execute on function poll_history_private.closed_poll_option_results(uuid[]) to anon, authenticated;

create or replace function public.get_closed_poll_option_results(p_poll_ids uuid[])
returns table(poll_id uuid, option_id uuid, label text, sort_order integer, votes bigint, last_vote_at timestamptz)
language sql stable security invoker set search_path = ''
as $$
  select * from poll_history_private.closed_poll_option_results(p_poll_ids)
  order by poll_id, sort_order, option_id;
$$;

revoke execute on function public.get_closed_poll_option_results(uuid[]) from public, anon, authenticated;
grant execute on function public.get_closed_poll_option_results(uuid[]) to anon, authenticated;
