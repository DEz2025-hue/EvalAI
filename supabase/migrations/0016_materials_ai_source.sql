-- Materials proposed by the AI are stored with their own source so they can be told apart from measured, rule-based and typed items.
-- Additive: the four existing values stay valid.
alter table materials_items drop constraint if exists materials_items_source_check;
alter table materials_items add constraint materials_items_source_check
  check (source in ('measurement','finding','rule','user_input','ai_suggested'));
