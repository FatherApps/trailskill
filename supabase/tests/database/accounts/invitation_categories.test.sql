-- The invitation offers only active categories (issue #67). All data is synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

insert into auth.users (id, email)
values ('58000000-0000-4000-8000-0000000000a1', 'inviter@example.test');
insert into public.schools (id, name)
values ('58000000-0000-4000-8000-0000000000b1', 'Invitation Categories School');
insert into public.training_groups (id, school_id, name)
values ('58000000-0000-4000-8000-0000000000d1', '58000000-0000-4000-8000-0000000000b1', 'Group One');
insert into public.categories (id, school_id, name, sort_order, active) values
  ('58000000-0000-4000-8000-0000000000c1', '58000000-0000-4000-8000-0000000000b1', 'Active Category', 1, true),
  ('58000000-0000-4000-8000-0000000000c2', '58000000-0000-4000-8000-0000000000b1', 'Inactive Category', 2, false);
insert into public.school_invitations (id, school_id, group_id, created_by)
values ('58000000-0000-4000-8000-000000000101', '58000000-0000-4000-8000-0000000000b1', '58000000-0000-4000-8000-0000000000d1', '58000000-0000-4000-8000-0000000000a1');

select is(
  (select jsonb_array_length(public.resolve_invitation(token)->'categories') from public.school_invitations
   where id = '58000000-0000-4000-8000-000000000101'),
  1,
  'the invitation lists one category'
);
select is(
  (select public.resolve_invitation(token)->'categories'->0->>'name' from public.school_invitations
   where id = '58000000-0000-4000-8000-000000000101'),
  'Active Category',
  'the invitation lists the active category'
);
select is(
  (select jsonb_path_exists(public.resolve_invitation(token), '$.categories[*] ? (@.name == "Inactive Category")')
   from public.school_invitations where id = '58000000-0000-4000-8000-000000000101'),
  false,
  'the invitation does not list the deactivated category'
);

select * from finish();
rollback;
