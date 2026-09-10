create or replace function public.initialize_profile(p_user_id uuid, p_timezone text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, chronobiology, occupational_context, psychology, metabolism)
  values (p_user_id, jsonb_build_object('chronotype','intermediate','timezone',coalesce(p_timezone,'UTC')), jsonb_build_object('timezone',coalesce(p_timezone,'UTC')), '{}'::jsonb, '{}'::jsonb)
  on conflict (id) do nothing;
end;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.initialize_profile(new.id, coalesce(new.raw_user_meta_data ->> 'timezone', 'UTC'));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

revoke all on function public.initialize_profile(uuid, text) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.initialize_profile(uuid, text) to postgres;
grant execute on function public.handle_new_user() to postgres;
