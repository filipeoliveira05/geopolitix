-- Some historical terms genuinely have no recorded party (e.g. pre-partisan
-- early Congresses, ~1791) — discovered when the legislators sync hit a
-- real row with a null party. NOT NULL here was a draft-schema mistake.
alter table terms alter column party drop not null;
