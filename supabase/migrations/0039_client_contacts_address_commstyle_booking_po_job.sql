-- Fix: communication_style was in TypeScript types but missing from the DB table.
-- This caused every client save to fail (PostgREST rejects unknown columns).
ALTER TABLE atelier_clients
  ADD COLUMN IF NOT EXISTS communication_style text
    CHECK (communication_style IN ('formal', 'casual', 'terse'));

-- New: physical/mailing address for clients
ALTER TABLE atelier_clients
  ADD COLUMN IF NOT EXISTS address text;

-- New: multiple contacts per client (in-house producers, brand managers, etc.)
-- Shape: [{ name, role?, email?, phone?, brands?: string[] }]
ALTER TABLE atelier_clients
  ADD COLUMN IF NOT EXISTS contacts jsonb NOT NULL DEFAULT '[]'::jsonb;

-- New: client PO number and job number for invoicing
ALTER TABLE atelier_bookings
  ADD COLUMN IF NOT EXISTS po_number text;

ALTER TABLE atelier_bookings
  ADD COLUMN IF NOT EXISTS job_number text;
