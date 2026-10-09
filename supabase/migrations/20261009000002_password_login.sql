-- Tomujin PE — password sign-in with one-time registration codes.
-- Run ONCE in Supabase SQL Editor after 20261009000001_init.sql.
--
-- How it works:
--   * Every student gets a 6-character access_code; every staff member an invite_code.
--   * First time: email + code + new password ("Бүртгүүлэх"). The database checks the
--     code, so knowing a classmate's email is not enough to take their account.
--   * After that: email + password.
--   * Forgot password: a teacher presses "Нэвтрэлт сэргээх" → a NEW code is made and the
--     old login is removed (all PE data stays). The student registers again with the new code.

alter table public.students add column if not exists access_code text not null
  default upper(substr(md5(gen_random_uuid()::text), 1, 6));
alter table public.staff add column if not exists invite_code text not null
  default upper(substr(md5(gen_random_uuid()::text), 1, 6));

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  e    text := lower(new.email);
  code text := upper(trim(coalesce(new.raw_user_meta_data ->> 'access_code', '')));
  st   public.staff%rowtype;
  stu  public.students%rowtype;
begin
  if e is null or e not like '%@tomujin.edu.mn' then
    raise exception 'Only @tomujin.edu.mn accounts are allowed';
  end if;

  select * into st from public.staff where email = e;
  if found then
    if code <> st.invite_code then raise exception 'Invalid registration code'; end if;
    insert into public.profiles (id, email, role) values (new.id, e, st.role);
    return new;
  end if;

  select * into stu from public.students where email = e and status = 'active';
  if found then
    if code <> stu.access_code then raise exception 'Invalid registration code'; end if;
    insert into public.profiles (id, email, role, student_id) values (new.id, e, 'student', stu.id);
    return new;
  end if;

  raise exception 'This email is not registered in Tomujin PE. Ask your PE teacher.';
end;
$$;

-- Staff: reset a student's login (new code, old account removed; PE data kept).
create or replace function public.reset_student_login(p_student uuid) returns text
language plpgsql security definer set search_path = public as $$
declare e text; c text := upper(substr(md5(gen_random_uuid()::text), 1, 6));
begin
  if not public.is_staff() then raise exception 'not allowed'; end if;
  update public.students set access_code = c where id = p_student returning email into e;
  if not found then raise exception 'student not found'; end if;
  if e is not null then
    delete from auth.users u where lower(u.email) = e
      and not exists (select 1 from public.staff s where s.email = e);
  end if;
  return c;
end;
$$;

-- Admin: reset a teacher's login (cannot reset yourself here).
create or replace function public.reset_staff_login(p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare c text := upper(substr(md5(gen_random_uuid()::text), 1, 6)); e text := lower(p_email);
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if e = (select email from public.profiles where id = auth.uid()) then raise exception 'cannot reset yourself'; end if;
  update public.staff set invite_code = c where email = e;
  if not found then raise exception 'staff not found'; end if;
  delete from auth.users u where lower(u.email) = e;
  return c;
end;
$$;

revoke all on function public.reset_student_login(uuid) from public, anon;
revoke all on function public.reset_staff_login(text) from public, anon;
grant execute on function public.reset_student_login(uuid) to authenticated;
grant execute on function public.reset_staff_login(text) to authenticated;

-- Remove logins created earlier by email link (they have no password), so those people
-- can register with a password. Only the login is removed; no PE data is touched.
delete from auth.users where coalesce(encrypted_password, '') = '';

-- Show the admin's own code once, so the first password can be set.
select email, invite_code as "Таны бүртгэлийн код" from public.staff where role = 'admin';
