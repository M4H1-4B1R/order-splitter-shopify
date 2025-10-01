-- Add processing columns to webhook_events
alter table if exists webhook_events
add column if not exists processed_at timestamptz,
add column if not exists last_error text;
