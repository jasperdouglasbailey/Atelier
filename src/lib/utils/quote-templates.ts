/**
 * Quote template line definitions for the photographer booking flow.
 *
 * These are the default line items that get generated when Jasper starts a
 * quote for a photographer booking. All amounts are in AUD.
 *
 * Template rates per Jasper's rate card (2026):
 *   Photographer shoot fee: $4,000/day
 *   Digital operator:       $600/day
 *   Assistant:              $600/day
 *
 * Lines that ship with unit_price: 0 are filled in by the operator after the
 * client brief lands. The " — TBD" suffix was dropped in PR#238.
 *
 * **Scope:** photographer only. The videographer / stylist / HMU templates
 * were retired 2026-05-20 — Jasper wanted the surface narrowed to one
 * canonical template while the brief flow stabilises. Reinstating any of
 * them is straightforward: add an entry to TEMPLATE_LINES_MAP, widen
 * QuoteTemplate, and surface the corresponding UI branch in QuoteBuilder.
 * The pre-deletion shape is in git history (PR#239 removed it).
 */

import { DEFAULT_ASF_RATE, DEFAULT_COMMISSION_RATE, SUPER_RATE_CHARGED, SUPER_RATE_PAID } from './constants';
import type { FeeLineType } from '@/lib/types/database';

export type QuoteTemplate = 'photographer';

export type TemplateLine = {
  line_type: FeeLineType;
  description: string;
  quantity: number;
  unit_price: number;
  is_commissionable: boolean;
  commission_rate: number;
  is_super_bearing: boolean;
  super_rate_charged: number;
  super_rate_paid: number;
  asf_rate: number;
};

export const TEMPLATE_LINES_MAP: Record<QuoteTemplate, TemplateLine[]> = {
  photographer: [
    {
      line_type: 'artist_fee',
      description: 'Photography capture and file management fee',
      quantity: 1, unit_price: 4000,
      is_commissionable: true, commission_rate: DEFAULT_COMMISSION_RATE,
      is_super_bearing: false, super_rate_charged: 0, super_rate_paid: 0,
      asf_rate: DEFAULT_ASF_RATE,
    },
    // post_production line is conditionally included by generateQuoteFromTemplateAction
    // when booking.post_production_ownership is 'us_via_artist' or 'us_via_post_team'
    {
      line_type: 'post_production',
      description: 'Post production fee',
      quantity: 1, unit_price: 0,
      is_commissionable: true, commission_rate: DEFAULT_COMMISSION_RATE,
      is_super_bearing: false, super_rate_charged: 0, super_rate_paid: 0,
      asf_rate: DEFAULT_ASF_RATE,
    },
    {
      line_type: 'expense',
      description: 'Camera, digital and lighting equipment allowance',
      quantity: 1, unit_price: 0,
      is_commissionable: false, commission_rate: 0,
      is_super_bearing: false, super_rate_charged: 0, super_rate_paid: 0,
      asf_rate: DEFAULT_ASF_RATE,
    },
    {
      line_type: 'crew_labour',
      description: 'Digital operator',
      quantity: 1, unit_price: 600,
      is_commissionable: false, commission_rate: 0,
      is_super_bearing: true, super_rate_charged: SUPER_RATE_CHARGED, super_rate_paid: SUPER_RATE_PAID,
      asf_rate: DEFAULT_ASF_RATE,
    },
    {
      line_type: 'crew_labour',
      description: 'First assistant',
      quantity: 1, unit_price: 600,
      is_commissionable: false, commission_rate: 0,
      is_super_bearing: true, super_rate_charged: SUPER_RATE_CHARGED, super_rate_paid: SUPER_RATE_PAID,
      asf_rate: DEFAULT_ASF_RATE,
    },
  ],
};
