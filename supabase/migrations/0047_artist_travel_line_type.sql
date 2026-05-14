-- Artist travel is commissionable; crew travel is not. The single
-- `travel` enum value couldn't distinguish, so we add a new value
-- `artist_travel` that joins the artist labour set (commissionable,
-- ASF default on, no super). Existing `travel` rows stay as crew/
-- production travel and remain non-commissionable.
ALTER TYPE atelier_fee_line_type ADD VALUE IF NOT EXISTS 'artist_travel';
