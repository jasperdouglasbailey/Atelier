-- Track when invoices are issued and when they are paid.
-- Both columns are set automatically by the application on state transition
-- (invoice_issued → sets invoice_issued_at; paid → sets paid_at).
-- Used to compute DOI (days outstanding invoice) and flag overdue accounts.
alter table atelier_bookings
  add column if not exists invoice_issued_at timestamptz,
  add column if not exists paid_at timestamptz;

comment on column atelier_bookings.invoice_issued_at is
  'Set automatically when booking transitions to invoice_issued state.';
comment on column atelier_bookings.paid_at is
  'Set automatically when booking transitions to paid state.';
