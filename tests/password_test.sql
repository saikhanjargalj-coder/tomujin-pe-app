\pset footer off
-- Runs AFTER rls_test.sql and migration 0002 on the same database.
\echo '--- P0 passwordless users from before were removed (expect 0 users)'
select count(*) as users_left from auth.users;
update public.students set access_code = 'ANU123' where first_name = 'Anu';
update public.staff set invite_code = 'JACK01' where email = 'saikhanjargal.j@tomujin.edu.mn';
\echo '--- P1 student with wrong code (expect ERROR)'
insert into auth.users (email, raw_user_meta_data, encrypted_password) values ('anu@tomujin.edu.mn', '{"access_code":"WRONG1"}', 'x');
\echo '--- P2 classmate trying Anu''s email with no code (expect ERROR)'
insert into auth.users (email, encrypted_password) values ('anu@tomujin.edu.mn', 'x');
\echo '--- P3 correct codes (lower-case + spaces accepted)'
insert into auth.users (id, email, raw_user_meta_data, encrypted_password) values ('00000000-0000-0000-0000-0000000000c2', 'anu@tomujin.edu.mn', '{"access_code":" anu123 "}', 'x');
insert into auth.users (id, email, raw_user_meta_data, encrypted_password) values ('00000000-0000-0000-0000-0000000000a2', 'saikhanjargal.j@tomujin.edu.mn', '{"access_code":"JACK01"}', 'x');
select email, role from public.profiles order by email;
\echo '--- P4 student cannot reset logins (expect ERROR)'
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c2';
select public.reset_student_login('aaaaaaaa-0000-0000-0000-00000000000a');
reset role;
\echo '--- P5 admin resets Anu: new code, login removed, fitness data kept'
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select length(public.reset_student_login('aaaaaaaa-0000-0000-0000-00000000000a')) as new_code_len;
reset role;
select (select count(*) from auth.users where email = 'anu@tomujin.edu.mn') as anu_login,
       (select access_code <> 'ANU123' from public.students where first_name = 'Anu') as code_changed,
       (select count(*) from public.fitness_results where student_id = 'aaaaaaaa-0000-0000-0000-00000000000a') as anu_results_kept;
\echo '--- P6 admin cannot reset self (expect ERROR)'
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select public.reset_staff_login('saikhanjargal.j@tomujin.edu.mn');
reset role;
\echo '--- P7 anon cannot call reset (expect ERROR)'
set role anon; select public.reset_student_login('aaaaaaaa-0000-0000-0000-00000000000a'); reset role;
