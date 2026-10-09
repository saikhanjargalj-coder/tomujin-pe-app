\set ON_ERROR_STOP 0
\pset footer off
-- Seed as superuser
insert into public.staff (email, full_name, role) values ('teacher.b@tomujin.edu.mn','Teacher B','teacher');
insert into public.classes (id, name, grade) values
 ('11111111-1111-1111-1111-111111111111','11B',11),('22222222-2222-2222-2222-222222222222','12C',12);
insert into public.students (id, first_name, email, class_id) values
 ('aaaaaaaa-0000-0000-0000-00000000000a','Anu','anu@tomujin.edu.mn','11111111-1111-1111-1111-111111111111'),
 ('bbbbbbbb-0000-0000-0000-00000000000b','Bat','bat@tomujin.edu.mn','22222222-2222-2222-2222-222222222222');
insert into public.fitness_results (student_id,test_code,period,value) values
 ('aaaaaaaa-0000-0000-0000-00000000000a','push_ups','baseline',20),('bbbbbbbb-0000-0000-0000-00000000000b','push_ups','baseline',30);
insert into public.lessons (id,title) values ('cccccccc-0000-0000-0000-00000000000c','Sprint basics'),('dddddddd-0000-0000-0000-00000000000d','Volleyball');
insert into public.class_lessons (class_id,lesson_id) values ('11111111-1111-1111-1111-111111111111','cccccccc-0000-0000-0000-00000000000c'),('22222222-2222-2222-2222-222222222222','dddddddd-0000-0000-0000-00000000000d');
insert into public.grade_entries (student_id,term,attendance,performance,showcase,attitude,preparation,load_awareness,bonus)
 values ('aaaaaaaa-0000-0000-0000-00000000000a','S1',100,80,90,70,100,50,5);

\echo '--- T1 signups (expect: admin ok, teacher ok, student ok, 2 rejections)'
insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000000a1','Saikhanjargal.J@tomujin.edu.mn');
insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000000b1','teacher.b@tomujin.edu.mn');
insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000000c1','anu@tomujin.edu.mn');
insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000000d1','stranger@gmail.com');
insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000000e1','unknown@tomujin.edu.mn');
select email, role, student_id is not null as linked from public.profiles order by email;
select 'core_score' as k, core_score, bonus from public.grade_entries;

\echo '--- T2 student Anu'
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select 'students visible' k, count(*) from public.students;
select 'classes visible' k, string_agg(name, ',') from public.classes;
select 'fitness visible' k, count(*) from public.fitness_results;
select 'lessons visible' k, string_agg(title, ',') from public.lessons;
select 'grades visible' k, count(*) from public.grade_entries;
select 'staff visible' k, count(*) from public.staff;
select 'profiles visible' k, count(*) from public.profiles;
update public.fitness_results set value = 99;  select 'after update attempt' k, value from public.fitness_results;
delete from public.students; select 'after delete attempt' k, count(*) from public.students;
insert into public.training_logs (student_id, activity, duration_min, rpe) values ('aaaaaaaa-0000-0000-0000-00000000000a','Run',40,6);
\echo 'expect ERROR next (log for another student):'
insert into public.training_logs (student_id, activity, duration_min, rpe) values ('bbbbbbbb-0000-0000-0000-00000000000b','Fake',40,6);
\echo 'expect ERROR next (student inserting a fitness result):'
insert into public.fitness_results (student_id,test_code,period,value) values ('aaaaaaaa-0000-0000-0000-00000000000a','long_jump','baseline',250);
update public.training_logs set rpe = 1; select 'own log (rpe unchanged=6, load=240)' k, rpe, session_load from public.training_logs;
\echo 'expect ERROR next (student adding staff):'
insert into public.staff (email) values ('hacker@tomujin.edu.mn');
reset role;

\echo '--- T3 teacher B'
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select 'students visible' k, count(*) from public.students;
select 'logs visible' k, count(*) from public.training_logs;
insert into public.fitness_results (student_id,test_code,period,value) values ('bbbbbbbb-0000-0000-0000-00000000000b','long_jump','baseline',210);
select 'fitness after teacher insert' k, count(*) from public.fitness_results;
\echo 'expect ERROR next (teacher adding staff, admin only):'
insert into public.staff (email) values ('new.t@tomujin.edu.mn');
reset role;

\echo '--- T4 admin'
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into public.staff (email, role) values ('new.t@tomujin.edu.mn','teacher');
select 'staff count' k, count(*) from public.staff;
reset role;

\echo '--- T5 anon'
set role anon; reset request.jwt.claim.sub;
select 'anon students' k, count(*) from public.students;
reset role;

\echo '--- T6 deactivating Anu removes nothing but blocks future signup; demoting teacher B'
update public.staff set role='admin' where email='teacher.b@tomujin.edu.mn';
select email, role from public.profiles where email='teacher.b@tomujin.edu.mn';
delete from public.staff where email='teacher.b@tomujin.edu.mn';
select 'teacher B profile after removal' k, count(*) from public.profiles where email='teacher.b@tomujin.edu.mn';

\echo '--- T7 re-adding teacher B relinks; deactivating Anu removes access; reactivating restores'
insert into public.staff (email, role) values ('teacher.b@tomujin.edu.mn','teacher');
select 'teacher B role after re-add' k, role from public.profiles where email='teacher.b@tomujin.edu.mn';
update public.students set status='inactive' where first_name='Anu';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select 'Anu sees students while inactive (expect 0)' k, count(*) from public.students;
reset role;
update public.students set status='active' where first_name='Anu';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select 'Anu sees students after reactivation (expect 1)' k, count(*) from public.students;
reset role;
