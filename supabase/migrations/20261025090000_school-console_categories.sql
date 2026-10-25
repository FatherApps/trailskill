-- Module school-console: categories per school, seeded from the templates of
-- the school's organization and editable by the school admin (issue #67).

-- Security fix: an athlete's category must belong to the same school as the
-- athlete_schools row. The old single-column foreign key let a school admin
-- point the row at a category of another school. The composite key checks the
-- pair (category, school). MATCH SIMPLE (the default) skips the check when
-- category_id is null, so an athlete may have no category. The default
-- NO ACTION on delete keeps a category in use from being deleted.
alter table public.categories
  add constraint categories_id_school_id_key unique (id, school_id);

alter table public.athlete_schools
  drop constraint athlete_schools_category_id_fkey;

alter table public.athlete_schools
  add constraint athlete_schools_category_school_fkey
  foreign key (category_id, school_id) references public.categories (id, school_id);
