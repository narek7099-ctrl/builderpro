-- Which national chain a supplier of theirs actually is.
--
-- The materials catalog says who carries each item as a chain id ("abc",
-- "ferguson", "homedepot_pro"), and the picker has to answer "do you
-- already buy there?" against the contractor's own supplier rows. Matching
-- on the typed name works but is guesswork; this records the answer at the
-- moment they add one from the built-in directory.
--
-- Empty for a supply house they typed in themselves, and for every row that
-- existed before this, which is why the picker still falls back to matching
-- on the name.

alter table public.suppliers add column if not exists dir_id text not null default '';

create index if not exists suppliers_dir_idx on public.suppliers (owner, dir_id) where dir_id <> '';
