-- governor_terms.governor_id already only ever links a state's *current*
-- term row to governors.id, and is treated as nullable/optional everywhere
-- that reads it (copyCurrentBiosToGovernors filters `.not("governor_id",
-- "is", null)`; getTermsForGovernor just returns [] if no match). The
-- original plain FK (RESTRICT by default) blocked governors.mjs from ever
-- deleting a governors row once governor_terms referenced it — confirmed
-- live: this turned "remove a departed/gap-state governor row" into a
-- permanent no-op, since the undeletable row kept getting re-linked by the
-- next governor-history.mjs run (it still matched on name), an infinite
-- cycle rather than the intended one-off transient conflict. ON DELETE SET
-- NULL lets the delete succeed and just detaches the reference, which is
-- exactly how the column is already used everywhere else in the app.
alter table governor_terms
  drop constraint governor_terms_governor_id_fkey,
  add constraint governor_terms_governor_id_fkey
    foreign key (governor_id) references governors(id) on delete set null;
