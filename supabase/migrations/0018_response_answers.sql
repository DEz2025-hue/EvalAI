-- Simple answer fields on checklist items (D-042): choices and typed numbers, kept beside the status and notes.
-- Additive: older answers stay valid with no fields filled in. The table's existing row-level security policies cover the new column.
-- Rollback: alter table checklist_responses drop column answers;
alter table checklist_responses add column if not exists answers jsonb;
