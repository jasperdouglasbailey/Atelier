/**
 * Quote template line definitions for standard shoot types.
 *
 * These are the default line items that get generated when Jasper starts a
 * quote for a photographer or videographer booking. All amounts are in AUD.
 *
 * Template rates per Jasper's rate card (2026):
 *   Photographer shoot fee: $4,000/day
 *   Videographer shoot fee: $3,000/day
 *   Digital operator:       $600/day
 *   Assistant:              $600/day
 *   1AC labour:             $900/day
 *   1AC kit:                $400/day
 *   Lighting tech labour:   $750/day
 *
 * Usage fee, grading, equipment hire, fringes, and agency fee lines are added
 * as TBD (unit_price: 0) so Jasper fills them in after the client brief.
 */

import { DEFAULT_ASF_RATE, DEFAULT_COMMISSION_RATE, SUPER_RATE_CHARGED, SUPER_RATE_PAID } from './constants';
import type { FeeLineType } from '@/lib/types/database';

export type QuoteTemplate = 'photographer' | 'videographer' | 'stylist' | 'hmu';

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
      description: 'Photographer — shoot fee (10hr day)',
      quantity: 1, unit_price: 4000,
      is_commissionable: true, commission_rate: DEFAULT_COMMISSION_RATE,
      is_super_bearing: false, super_rate_charged: 0, super_rate_paid: 0,
      asf_rate: DEFAULT_ASF_RATE,
    },
    {
      line_type: 'usage_licence',
      description: 'Usage fee — TBD',
      quantity: 1, unit_price: 0,
      is_commissionable: true, commission_rate: DEFAULT_COMMISSION_RATE,
      is_super_bearing: false, super_rate_charged: 0, super_rate_paid: 0,
      asf_rate: DEFAULT_ASF_RATE,
    },
    {
      line_type: 'retouching',
      description: 'Grading / retouching — TBD',
      quantity: 1, unit_price: 0,
      is_commissionable: true, commission_rate: DEFAULT_COMMISSION_RATE,
      is_super_bearing: false, super_rate_charged: 0, super_rate_paid: 0,
      asf_rate: DEFAULT_ASF_RATE,
    },
    {
      line_type: 'crew_equipment',
      description: 'Camera equipment — TBD',
      quantity: 1, unit_price: 0,
      is_commissionable: false, commission_rate: 0,
      is_super_bearing: false, super_rate_charged: 0, super_rate_paid: 0,
      asf_rate: DEFAULT_ASF_RATE,
    },
    {
      line_type: 'crew_equipment',
      description: 'Digital equipment — TBD',
      quantity: 1, unit_price: 0,
      is_commissionable: false, commission_rate: 0,
      is_super_bearing: false, super_rate_charged: 0, super_rate_paid: 0,
      asf_rate: DEFAULT_ASF_RATE,
    },
    {
      line_type: 'equipment_rental',
      description: 'Lighting equipment — TBD',
      quantity: 1, unit_price: 0,
      is_commissionable: false, commission_rate: 0,
      is_super_bearing: false, super_rate_charged: 0, super_rate_paid: 0,
      asf_rate: DEFAULT_ASF_RATE,
    },
    {
      line_type: 'crew_labour',
      description: 'Digital operator',
      quantity: 1, unit_price: 600,
      is_commissionable: true, commission_rate: DEFAULT_COMMISSION_RATE,
      is_super_bearing: true, super_rate_charged: SUPER_RATE_CHARGED, super_rate_paid: SUPER_RATE_PAID,
      asf_rate: DEFAULT_ASF_RATE,
    },
    {
      line_type: 'crew_labour',
      description: 'Assistant',
      quantity: 1, unit_price: 600,
      is_commissionable: true, commission_rate: DEFAULT_COMMISSION_RATE,
      is_super_bearing: true, super_rate_charged: SUPER_RATE_CHARGED, super_rate_paid: SUPER_RATE_PAID,
      asf_rate: DEFAULT_ASF_RATE,
    },
  ],
  videographer: [
    {
      line_type: 'artist_fee',
      description: 'Videographer — shoot fee',
      quantity: 1, unit_price: 3000,
      is_commissionable: true, commission_rate: DEFAULT_COMMISSION_RATE,
      is_super_bearing: false, super_rate_charged: 0, super_rate_paid: 0,
      asf_rate: DEFAULT_ASF_RATE,
    },
    {
      line_type: 'retouching',
      description: 'Grading — TBD',
      quantity: 1, unit_price: 0,
      is_commissionable: true, commission_rate: DEFAULT_COMMISSION_RATE,
      is_super_bearing: false, super_rate_charged: 0, super_rate_paid: 0,
      asf_rate: DEFAULT_ASF_RATE,
    },
    {
      line_type: 'post_production',
      description: 'Edit fee — TBD ($/day)',
      quantity: 1, unit_price: 0,
      is_commissionable: true, commission_rate: DEFAULT_COMMISSION_RATE,
      is_super_bearing: false, super_rate_charged: 0, super_rate_paid: 0,
      asf_rate: DEFAULT_ASF_RATE,
    },
    {
      line_type: 'crew_equipment',
      description: 'Camera equipment — TBD',
      quantity: 1, unit_price: 0,
      is_commissionable: false, commission_rate: 0,
      is_super_bearing: false, super_rate_charged: 0, super_rate_paid: 0,
      asf_rate: DEFAULT_ASF_RATE,
    },
    {
      line_type: 'crew_equipment',
      description: 'Digital equipment — TBD',
      quantity: 1, unit_price: 0,
      is_commissionable: false, commission_rate: 0,
      is_super_bearing: false, super_rate_charged: 0, super_rate_paid: 0,
      asf_rate: DEFAULT_ASF_RATE,
    },
    {
      line_type: 'equipment_rental',
      description: 'Lighting equipment — TBD',
      quantity: 1, unit_price: 0,
      is_commissionable: false, commission_rate: 0,
      is_super_bearing: false, super_rate_charged: 0, super_rate_paid: 0,
      asf_rate: DEFAULT_ASF_RATE,
    },
    {
      line_type: 'crew_labour',
      description: '1AC labour',
      quantity: 1, unit_price: 900,
      is_commissionable: true, commission_rate: DEFAULT_COMMISSION_RATE,
      is_super_bearing: true, super_rate_charged: SUPER_RATE_CHARGED, super_rate_paid: SUPER_RATE_PAID,
      asf_rate: DEFAULT_ASF_RATE,
    },
    {
      line_type: 'crew_equipment',
      description: '1AC kit — TBD',
      quantity: 1, unit_price: 0,
      is_commissionable: false, commission_rate: 0,
      is_super_bearing: false, super_rate_charged: 0, super_rate_paid: 0,
      asf_rate: DEFAULT_ASF_RATE,
    },
    {
      line_type: 'crew_labour',
      description: 'Lighting tech labour',
      quantity: 1, unit_price: 750,
      is_commissionable: true, commission_rate: DEFAULT_COMMISSION_RATE,
      is_super_bearing: true, super_rate_charged: SUPER_RATE_CHARGED, super_rate_paid: SUPER_RATE_PAID,
      asf_rate: DEFAULT_ASF_RATE,
    },
  ],
  stylist: [
    {
      line_type: 'artist_fee',
      description: 'Wardrobe stylist — shoot day rate',
      quantity: 1, unit_price: 1800,
      is_commissionable: true, commission_rate: DEFAULT_COMMISSION_RATE,
      is_super_bearing: true, super_rate_charged: SUPER_RATE_CHARGED, super_rate_paid: SUPER_RATE_PAID,
      asf_rate: DEFAULT_ASF_RATE,
    },
    {
      line_type: 'artist_fee',
      description: 'Pre-pro / styling days — TBD',
      quantity: 1, unit_price: 0,
      is_commissionable: true, commission_rate: DEFAULT_COMMISSION_RATE,
      is_super_bearing: true, super_rate_charged: SUPER_RATE_CHARGED, super_rate_paid: SUPER_RATE_PAID,
      asf_rate: DEFAULT_ASF_RATE,
    },
    {
      line_type: 'artist_fee',
      description: 'Stylist kit fee — TBD',
      quantity: 1, unit_price: 0,
      is_commissionable: true, commission_rate: DEFAULT_COMMISSION_RATE,
      is_super_bearing: false, super_rate_charged: 0, super_rate_paid: 0,
      asf_rate: DEFAULT_ASF_RATE,
    },
    {
      line_type: 'wardrobe',
      description: 'Wardrobe pull / return / steaming — TBD',
      quantity: 1, unit_price: 0,
      is_commissionable: false, commission_rate: 0,
      is_super_bearing: false, super_rate_charged: 0, super_rate_paid: 0,
      asf_rate: DEFAULT_ASF_RATE,
    },
    {
      line_type: 'travel',
      description: 'Travel / couriers — TBD',
      quantity: 1, unit_price: 0,
      is_commissionable: false, commission_rate: 0,
      is_super_bearing: false, super_rate_charged: 0, super_rate_paid: 0,
      asf_rate: DEFAULT_ASF_RATE,
    },
  ],
  hmu: [
    {
      line_type: 'artist_fee',
      description: 'Hair & makeup — shoot day rate',
      quantity: 1, unit_price: 1400,
      is_commissionable: true, commission_rate: DEFAULT_COMMISSION_RATE,
      is_super_bearing: true, super_rate_charged: SUPER_RATE_CHARGED, super_rate_paid: SUPER_RATE_PAID,
      asf_rate: DEFAULT_ASF_RATE,
    },
    {
      line_type: 'artist_fee',
      description: 'Pre-pro / test day — TBD',
      quantity: 1, unit_price: 0,
      is_commissionable: true, commission_rate: DEFAULT_COMMISSION_RATE,
      is_super_bearing: true, super_rate_charged: SUPER_RATE_CHARGED, super_rate_paid: SUPER_RATE_PAID,
      asf_rate: DEFAULT_ASF_RATE,
    },
    {
      line_type: 'artist_fee',
      description: 'Kit fee — TBD',
      quantity: 1, unit_price: 0,
      is_commissionable: true, commission_rate: DEFAULT_COMMISSION_RATE,
      is_super_bearing: false, super_rate_charged: 0, super_rate_paid: 0,
      asf_rate: DEFAULT_ASF_RATE,
    },
    {
      line_type: 'travel',
      description: 'Travel — TBD',
      quantity: 1, unit_price: 0,
      is_commissionable: false, commission_rate: 0,
      is_super_bearing: false, super_rate_charged: 0, super_rate_paid: 0,
      asf_rate: DEFAULT_ASF_RATE,
    },
  ],
};
