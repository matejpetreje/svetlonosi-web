-- Vote submission and every close path already share the stream and poll locks.
create or replace function public._spark_close_poll(p_poll_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_stream uuid;
  v_top bigint;
  v_total bigint;
  v_labels text;
  v_count integer;
begin
  select spark_stream_id into v_stream from public.polls where id = p_poll_id;
  if v_stream is not null then
    perform 1 from public.spark_streams where id = v_stream for update;
  end if;
  perform 1 from public.polls where id = p_poll_id and status = 'open' for update;
  if not found then
    return;
  end if;

  -- The time of the last vote is when the option reached its final total.
  with option_tallies as (
    select o.id, o.label, count(v.id) as votes, max(v.created_at) as reached_at
    from public.poll_options o
    left join public.votes v on v.option_id = o.id
    where o.poll_id = p_poll_id
    group by o.id, o.label
  ), ranked as (
    select label, votes, sum(votes) over () as total_votes,
           dense_rank() over (order by votes desc, reached_at asc nulls last) as place
    from option_tallies
  )
  select coalesce(max(total_votes), 0), coalesce(max(votes), 0),
         count(*), string_agg(label, ' / ' order by label)
  into v_total, v_top, v_count, v_labels
  from ranked
  where place = 1;

  update public.polls
  set status = 'closed',
      closed_at = now(),
      winner_option_id = null,
      winner_label = case
        when v_total = 0 then 'Bez hlasů'
        when v_count > 1 then 'Remíza: ' || v_labels
        else v_labels
      end,
      winner_votes = v_top::integer,
      total_votes = v_total::integer,
      winner_pct = case when v_total = 0 then 0 else round(v_top::numeric / v_total * 100, 2) end,
      overlay_result_until = case when overlay_visible then now() + interval '8 seconds' else null end
  where id = p_poll_id;
end;
$function$;
