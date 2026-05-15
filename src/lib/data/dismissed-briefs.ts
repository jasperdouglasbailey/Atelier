/**
 * Dismissed brief candidates — persistent "Not a brief" markers.
 *
 * The /inbox Potential Briefs panel used to dismiss candidates in React
 * local state only, so they reappeared after every refresh. This data
 * layer persists dismissals to atelier_dismissed_brief_candidates so the
 * filter survives refreshes, and supports both inline undo and a "Show
 * dismissed" recovery toggle on the panel.
 *
 * Auth: owner / partner only via RLS policy (migration 0051).
 */

import { createClient } from '@/lib/supabase/server';

export type DismissedBriefRow = {
  gmail_message_id: string;
  dismissed_at: string;
  dismissed_by: string | null;
  subject: string | null;
  from_header: string | null;
  received_at: string | null;
};

/** All dismissal rows, ordered most-recent first. Used by "Show dismissed" UI. */
export async function listDismissedBriefs(): Promise<DismissedBriefRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('atelier_dismissed_brief_candidates')
    .select('*')
    .order('dismissed_at', { ascending: false })
    .limit(100);
  return (data ?? []) as DismissedBriefRow[];
}

/** Just the IDs, as a Set for cheap filter membership tests in findPotentialBriefs. */
export async function listDismissedBriefIds(): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('atelier_dismissed_brief_candidates')
    .select('gmail_message_id');
  return new Set(((data ?? []) as { gmail_message_id: string }[]).map((r) => r.gmail_message_id));
}

export type DismissInput = {
  gmail_message_id: string;
  subject: string | null;
  from_header: string | null;
  received_at: string | null;
  dismissed_by: string | null;
};

/** Insert a dismissal. Idempotent — repeats are silently absorbed by the PK conflict. */
export async function dismissBriefCandidate(input: DismissInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('atelier_dismissed_brief_candidates')
    .upsert(
      {
        gmail_message_id: input.gmail_message_id,
        subject: input.subject,
        from_header: input.from_header,
        received_at: input.received_at,
        dismissed_by: input.dismissed_by,
        dismissed_at: new Date().toISOString(),
      },
      { onConflict: 'gmail_message_id' },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Delete a dismissal row, restoring the candidate to the active list. */
export async function undismissBriefCandidate(gmail_message_id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('atelier_dismissed_brief_candidates')
    .delete()
    .eq('gmail_message_id', gmail_message_id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
