-- Module school-console: the pair (group, school) as a key (issue #70), the same
-- as categories_id_school_id_key, so another module can reference a group of a
-- given school with a composite foreign key.
alter table public.training_groups
  add constraint training_groups_id_school_id_key unique (id, school_id);
