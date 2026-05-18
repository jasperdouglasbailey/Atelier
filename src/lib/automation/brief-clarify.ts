/**
 * Brief-clarify auto-trigger.
 *
 * When the brief parser lands a low-confidence result (< 70 / 100),
 * this module queues an approval-gated clarifying email draft into the
 * inbox automatically — saving Jasper a click. Doctrine: outbound mail
 * always lands in atelier_approvals first, never auto-sends.
 *
 * The email is template-driven (no LLM) for speed and reliability —
 * the auto-trigger fires inline with parseBriefAction, so we don't
 * want to add a 2-3 second LLM round-trip to every parse. If Jasper
 * wants a more polished, voice-tuned draft, the existing manual
 * action (`draftClarifyingEmailAction` in bookings.ts) still goes
 * through the full LLM + critique pass.
 *
 * Idempotency: `brief_clarify_auto_{bookingId}` — fires once per
 * booking. If the brief is later edited and re-parsed, the auto-queue
 * skips. Jasper can always trigger the manual full-LLM version from
 * the UI.
 */

import { createClient } from '@/lib/supabase/server';
import { createApproval } from '@/lib/data/approvals';
import { getKillSwitchState } from '@/lib/utils/kill-switch';
import { buildBriefClarifyEmail } from '@/lib/utils/comms-tone';
import type { BriefIntakeResult } from './brief-intake';
import type { CommunicationStyle } from '@/lib/types/database';

/**
 * Field-level questions to ask the client when fields are missing.
 * Phrased politely, in Jasper's voice (no exclamation marks).
 */
const FIELD_QUESTIONS: Record<keyof BriefIntakeResult & string, string> = {
  shoot_location: 'Where will the shoot take place — studio, location, or both?',
  shoot_date_start: 'Can you confirm the shoot date(s)? The brief mentions timing but no firm date.',
  shoot_date_end: 'Can you confirm the shoot date(s)? The brief mentions timing but no firm date.',
  shoot_date_notes: 'Can you confirm the shoot date(s)? The brief mentions timing but no firm date.',
  // talent_count removed from clarify-questions per Jasper 2026-05-18.
  // No string here = never asked about. The Record requires the key,
  // empty string is the "never ask" convention used by metadata fields.
  talent_count: '',
  talent_spec: 'What kind of talent are you after — gender, age range, look?',
  deliverables_type: 'What deliverables are you expecting (stills, BTS video, both)?',
  deliverables_count: 'Roughly how many final images / selects do you need?',
  usage_duration_months: 'What usage period are you after (months or years)?',
  usage_territory_raw: 'Which territories does the usage need to cover?',
  usage_media_raw: 'Which media — print, digital, OOH, social?',
  budget_indication: 'Do you have a budget indication for the project?',
  // Output / metadata fields — never asked about
  source: '', confidence: '', llmAvailable: '',
  uncertainty_sources: '', critique: '', contract: '',
  // Structured usage taxonomy (LLM-only) — never asked about because the
  // raw fields above cover the same ground; if structured fields are
  // missing it's the LLM not the client.
  usage_market: '', usage_realm: '',
  usage_media_categories: '', usage_specific_channels: '',
  usage_territory_iso: '',
  // Extra LLM-only fields added 2026-05-18 — never asked-about (the
  // brief either gives them or it doesn't; no clarifying question).
  title_suggestion: '',
  post_production_ownership: '',
} as const;

const PRIORITY_FIELDS: Array<keyof BriefIntakeResult> = [
  'shoot_date_start',
  'shoot_location',
  'deliverables_type',
  // talent_count removed 2026-05-18 — never asked.
  'usage_duration_months',
];

/**
 * Pick up to 4 question lines from the parsed brief based on which key
 * fields are missing. Order matters — date first (unblocks crew), then
 * location (unblocks travel), then deliverables, then talent, then usage.
 */
function pickQuestions(parsed: BriefIntakeResult): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const field of PRIORITY_FIELDS) {
    if (parsed[field] != null) continue;
    const q = FIELD_QUESTIONS[field as keyof typeof FIELD_QUESTIONS];
    if (!q || seen.has(q)) continue;
    out.push(q);
    seen.add(q);
    if (out.length >= 4) break;
  }
  return out;
}

// buildEmailBody removed — replaced by buildBriefClarifyEmail from comms-tone.ts

/**
 * Auto-queue a brief-clarify approval row for low-confidence parses.
 *
 * Returns:
 *   - { queued: true,  approvalId } when a new draft was queued
 *   - { queued: false, reason } for every skip path (no client email,
 *     idempotency hit, kill switch, no questions to ask, etc.)
 *
 * Always returns — never throws. The caller is parseBriefAction, which
 * shouldn't fail if the auto-queue fails.
 */
export async function autoQueueBriefClarifyIfNeeded(
  bookingId: string,
  result: BriefIntakeResult,
): Promise<{ queued: true; approvalId: string } | { queued: false; reason: string }> {
  // Threshold: confidence < 70 means we have low confidence in the
  // extraction. Above that, the parse is good enough to skip the chase.
  if (result.contract.confidence >= 70) {
    return { queued: false, reason: 'confidence_ok' };
  }

  // Doctrine: kill switch RED defers automation.
  const ks = await getKillSwitchState();
  if (ks?.is_active) {
    return { queued: false, reason: 'kill_switch_active' };
  }

  const questions = pickQuestions(result);
  if (questions.length === 0) {
    return { queued: false, reason: 'no_questions_needed' };
  }

  const supabase = await createClient();
  const { data: booking } = await supabase
    .from('atelier_bookings')
    .select('id, booking_ref, title, client:atelier_clients!atelier_bookings_client_id_fkey(name, company, email, communication_style)')
    .eq('id', bookingId)
    .maybeSingle();

  if (!booking) return { queued: false, reason: 'booking_not_found' };

  const clientRaw = (booking as unknown as {
    client: { name: string; company: string | null; email: string | null; communication_style: CommunicationStyle | null }
          | { name: string; company: string | null; email: string | null; communication_style: CommunicationStyle | null }[]
          | null;
  }).client;
  const clientObj = Array.isArray(clientRaw) ? clientRaw[0] ?? null : clientRaw;
  const clientEmail = clientObj?.email ?? null;
  const clientName = clientObj?.company ?? clientObj?.name ?? 'there';
  const commStyle = clientObj?.communication_style ?? null;

  if (!clientEmail) return { queued: false, reason: 'no_client_email' };

  const { subject, body } = buildBriefClarifyEmail({
    style: commStyle,
    clientName,
    bookingTitle: (booking as { title: string }).title,
    bookingRef: (booking as { booking_ref: string | null }).booking_ref,
    questions,
  });

  const { approval, duplicate } = await createApproval({
    agent: 'comms',
    action_type: 'client_brief_clarify_email',
    booking_id: bookingId,
    summary: `Brief clarifications — ${(booking as { booking_ref: string | null }).booking_ref ?? (booking as { title: string }).title}`,
    draft_content: {
      to: [clientEmail],
      subject,
      body,
      questions,
      communication_style: commStyle,
      // Confidence + uncertainty surface in the inbox so Jasper sees
      // why this draft was auto-queued.
      parse_confidence: result.contract.confidence,
      parse_uncertainties: result.contract.uncertainties,
    },
    confidence: result.contract.confidence,
    uncertainty_sources: result.contract.uncertainties,
    idempotency_key: `brief_clarify_auto_${bookingId}`,
  });

  if (duplicate) return { queued: false, reason: 'already_queued' };
  if (!approval) return { queued: false, reason: 'create_failed' };
  return { queued: true, approvalId: approval.id };
}
