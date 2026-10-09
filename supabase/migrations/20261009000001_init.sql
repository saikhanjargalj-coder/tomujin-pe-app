-- Tomujin PE — initial schema
-- Safe to run once on a NEW Supabase project (SQL Editor → paste → Run).
-- Security model:
--   * Only @tomujin.edu.mn emails can sign in.
--   * An email must be listed in public.staff (teacher/admin) or public.students
--     (student) BEFORE its first sign-in; anyone else is rejected.
--   * Staff can read/write everything. Students can only READ their own records,
--     and can only ADD their own training logs (no edit/delete).
--   * All of this is enforced by Row Level Security in the database, not the UI.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.staff (
  email       text primary key check (email = lower(email) and email like '%@tomujin.edu.mn'),
  full_name   text not null default '',
  role        text not null default 'teacher' check (role in ('admin', 'teacher')),
  created_at  timestamptz not null default now()
);

create table public.classes (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,                       -- e.g. 11B
  grade          int  not null check (grade between 1 and 12),
  academic_year  text not null default '2026-27',
  teacher_email  text,
  location       text,
  notes          text,
  created_at     timestamptz not null default now(),
  unique (name, academic_year)
);

create table public.students (
  id            uuid primary key default gen_random_uuid(),
  student_code  text unique,
  first_name    text not null,
  last_name     text not null default '',
  email         text unique check (email is null or (email = lower(email) and email like '%@tomujin.edu.mn')),
  class_id      uuid references public.classes(id) on delete set null,
  gender        text check (gender is null or gender in ('M', 'F', 'Other')),
  status        text not null default 'active' check (status in ('active', 'inactive')),
  notes         text,
  created_at    timestamptz not null default now()
);
create index on public.students (class_id);

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  role        text not null check (role in ('admin', 'teacher', 'student')),
  student_id  uuid references public.students(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.assessment_tests (
  code              text primary key,
  name_mn           text not null,
  name_en           text not null,
  unit              text not null,
  higher_is_better  boolean not null default true,
  sort_order        int not null default 0,
  active            boolean not null default true
);

create table public.fitness_results (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.students(id) on delete cascade,
  test_code      text not null references public.assessment_tests(code),
  period         text not null check (period in ('baseline', 'mid', 'final')),
  academic_year  text not null default '2026-27',
  value          numeric not null,
  tested_on      date not null default current_date,
  notes          text,
  entered_by     uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  unique (student_id, test_code, period, academic_year)
);
create index on public.fitness_results (student_id);

create table public.lessons (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  grade_band    text,                 -- e.g. "1-3", "6-7", "11-12"
  focus         text,
  duration_min  int not null default 80 check (duration_min between 10 and 240),
  objectives    text,
  warmup        text,
  main_part     text,
  game          text,
  reflection    text,
  equipment     text,
  safety        text,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.class_lessons (
  id              uuid primary key default gen_random_uuid(),
  class_id        uuid not null references public.classes(id) on delete cascade,
  lesson_id       uuid not null references public.lessons(id) on delete cascade,
  scheduled_date  date,
  notes           text,
  created_at      timestamptz not null default now()
);
create index on public.class_lessons (class_id);

create table public.training_logs (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.students(id) on delete cascade,
  session_date  date not null default current_date,
  activity      text not null,
  duration_min  int not null check (duration_min between 1 and 300),
  active_min    int check (active_min is null or active_min between 0 and 300),
  rpe           int not null check (rpe between 1 and 10),
  body_feeling  int check (body_feeling is null or body_feeling between 1 and 5),
  reflection    text,
  session_load  int generated always as (duration_min * rpe) stored,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now()
);
create index on public.training_logs (student_id);

-- Weights: attendance 20, performance 30, showcase 15, attitude 15,
-- preparation 10, load awareness 10. Bonus (0-10) is kept SEPARATE and is not
-- included in core_score.
create table public.grade_entries (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.students(id) on delete cascade,
  academic_year    text not null default '2026-27',
  term             text not null check (term in ('S1', 'S2', 'S3', 'S4')),
  attendance       numeric check (attendance between 0 and 100),
  performance      numeric check (performance between 0 and 100),
  showcase         numeric check (showcase between 0 and 100),
  attitude         numeric check (attitude between 0 and 100),
  preparation      numeric check (preparation between 0 and 100),
  load_awareness   numeric check (load_awareness between 0 and 100),
  bonus            numeric not null default 0 check (bonus between 0 and 10),
  core_score       numeric generated always as (
    round(coalesce(attendance,0)*0.20 + coalesce(performance,0)*0.30 + coalesce(showcase,0)*0.15
        + coalesce(attitude,0)*0.15 + coalesce(preparation,0)*0.10 + coalesce(load_awareness,0)*0.10, 1)
  ) stored,
  teacher_comment  text,
  updated_at       timestamptz not null default now(),
  unique (student_id, academic_year, term)
);

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so policies don't recurse)
-- ---------------------------------------------------------------------------

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin', 'teacher') from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.my_student_id() returns uuid
language sql stable security definer set search_path = public as $$
  select student_id from public.profiles where id = auth.uid() and role = 'student'
$$;

create or replace function public.my_class_id() returns uuid
language sql stable security definer set search_path = public as $$
  select s.class_id from public.students s where s.id = public.my_student_id()
$$;

-- ---------------------------------------------------------------------------
-- Sign-in gate: runs when Supabase creates a user on first sign-in
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  e text := lower(new.email);
  st public.staff%rowtype;
  sid uuid;
begin
  if e is null or e not like '%@tomujin.edu.mn' then
    raise exception 'Only @tomujin.edu.mn accounts are allowed';
  end if;

  select * into st from public.staff where email = e;
  if found then
    insert into public.profiles (id, email, role) values (new.id, e, st.role);
    return new;
  end if;

  select id into sid from public.students where email = e and status = 'active';
  if found then
    insert into public.profiles (id, email, role, student_id) values (new.id, e, 'student', sid);
    return new;
  end if;

  raise exception 'This email is not registered in Tomujin PE. Ask your PE teacher.';
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profiles in sync when staff roles or student emails change later.
create or replace function public.sync_staff_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    delete from public.profiles where email = old.email and role in ('admin', 'teacher');
    return old;
  end if;
  if tg_op = 'UPDATE' and old.email <> new.email then
    delete from public.profiles where email = old.email and role in ('admin', 'teacher');
  end if;
  -- (Re)link an existing login account, e.g. a teacher who was removed and re-added.
  insert into public.profiles (id, email, role)
    select u.id, new.email, new.role from auth.users u where lower(u.email) = new.email
  on conflict (id) do update set role = excluded.role, student_id = null;
  return new;
end;
$$;
create trigger staff_sync after insert or update or delete on public.staff
  for each row execute function public.sync_staff_profile();

create or replace function public.sync_student_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.email is distinct from new.email and old.email is not null then
    delete from public.profiles where email = old.email and role = 'student';
  end if;
  if new.status = 'inactive' then
    delete from public.profiles where student_id = new.id and role = 'student';
    return new;
  end if;
  -- Link an existing login account to this student (never downgrades staff).
  if new.email is not null then
    insert into public.profiles (id, email, role, student_id)
      select u.id, new.email, 'student', new.id from auth.users u where lower(u.email) = new.email
    on conflict (id) do update set student_id = excluded.student_id
      where public.profiles.role = 'student';
  end if;
  return new;
end;
$$;
create trigger students_sync after insert or update on public.students
  for each row execute function public.sync_student_profile();

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
create trigger lessons_touch before update on public.lessons
  for each row execute function public.touch_updated_at();
create trigger grades_touch before update on public.grade_entries
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.staff            enable row level security;
alter table public.profiles         enable row level security;
alter table public.classes          enable row level security;
alter table public.students         enable row level security;
alter table public.assessment_tests enable row level security;
alter table public.fitness_results  enable row level security;
alter table public.lessons          enable row level security;
alter table public.class_lessons    enable row level security;
alter table public.training_logs    enable row level security;
alter table public.grade_entries    enable row level security;

-- staff list: staff can read; only admin can change
create policy staff_read  on public.staff for select to authenticated using (public.is_staff());
create policy staff_admin on public.staff for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- profiles: you see yourself; staff see all. No client writes (trigger only).
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());

-- Staff: full access to teaching data
create policy classes_staff          on public.classes          for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy students_staff         on public.students         for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy fitness_staff          on public.fitness_results  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy lessons_staff          on public.lessons          for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy class_lessons_staff    on public.class_lessons    for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy training_logs_staff    on public.training_logs    for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy grades_staff           on public.grade_entries    for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy tests_read             on public.assessment_tests for select to authenticated using (true);
create policy tests_admin            on public.assessment_tests for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Students: read-only access to their own records
create policy classes_student       on public.classes         for select to authenticated using (id = public.my_class_id());
create policy students_student      on public.students        for select to authenticated using (id = public.my_student_id());
create policy fitness_student       on public.fitness_results for select to authenticated using (student_id = public.my_student_id());
create policy grades_student        on public.grade_entries   for select to authenticated using (student_id = public.my_student_id());
create policy class_lessons_student on public.class_lessons   for select to authenticated using (class_id = public.my_class_id());
create policy lessons_student       on public.lessons         for select to authenticated using (
  exists (select 1 from public.class_lessons cl where cl.lesson_id = lessons.id and cl.class_id = public.my_class_id())
);

-- Students: can read and ADD their own training logs (no update/delete)
create policy training_logs_student_read   on public.training_logs for select to authenticated
  using (student_id = public.my_student_id());
create policy training_logs_student_insert on public.training_logs for insert to authenticated
  with check (student_id = public.my_student_id() and created_by = auth.uid());

-- Anonymous visitors get nothing.
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------------
-- Seed data
-- ---------------------------------------------------------------------------

insert into public.staff (email, full_name, role) values
  ('saikhanjargal.j@tomujin.edu.mn', 'Saikhanjargal Jargalsaikhan', 'admin')
on conflict (email) do nothing;

insert into public.assessment_tests (code, name_mn, name_en, unit, higher_is_better, sort_order) values
  ('sprint_50m',   '50 м гүйлт',               '50 m sprint',                's',  false, 1),
  ('sit_reach',    'Суугаад урагш тонгойх',     'Sit-and-reach',              'cm', true,  2),
  ('mile_run',     '1 миль гүйлт',             'One-mile run',               's',  false, 3),
  ('ruler_drop',   'Шугам барих (реакц)',       'Ruler-drop reaction',        'cm', false, 4),
  ('wall_toss',    'Хана руу шидэх 1 мин',      '1-min alternating wall toss','reps', true, 5),
  ('push_ups',     'Суниалт',                  'Push-ups',                   'reps', true, 6),
  ('long_jump',    'Газраас уртад үсрэх',       'Standing long jump',         'cm', true,  7)
on conflict (code) do nothing;
