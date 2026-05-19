/**
 * UsageSummary — readable rendering of the structured usage taxonomy.
 *
 * The structured taxonomy lives on `atelier_bookings` as five fields
 * (usage_market, usage_realm, usage_media_categories,
 * usage_specific_channels, usage_territory_iso). Raw, these read like
 * debug output: "consumer · advertising · online · AU · social_paid".
 *
 * This component turns them into 3 human-readable lines:
 *
 *     AU + NZ
 *     Online (Paid social, Organic social, EDM), Print, Outdoor
 *     Consumer advertising
 *
 * Used both on the booking detail JobFacts surface and on the brief
 * parser apply-preview, so the operator and the talent both see the
 * same friendly rendering. Renders nothing when every field is empty.
 */

import { PALETTE } from '@/lib/utils/constants';

type Props = {
  market: 'consumer' | 'trade' | 'editorial' | null | undefined;
  realm: 'advertising' | 'promotional' | 'pr' | 'corporate' | 'editorial' | null | undefined;
  mediaCategories: Array<'online' | 'broadcast' | 'print' | 'outdoor' | 'ambient'> | null | undefined;
  specificChannels: string[] | null | undefined;
  territoryIso: string[] | null | undefined;
  /** Licence duration in months. 999 = in perpetuity. Restored 2026-05-19. */
  durationMonths?: number | null | undefined;
  /** Inline label position. 'horizontal' = JobFacts-style row; 'block' = standalone (e.g. on the brief preview). */
  layout?: 'horizontal' | 'block';
};

/**
 * Human-friendly duration label. The LLM brief intake emits an integer
 * count of months ("6 months" → 6, "1 year" → 12, "in perpetuity" → 999).
 * Render: < 12 → "N months", multiples of 12 → "N year(s)", otherwise
 * fallback to months, and 999+ → "In perpetuity".
 */
function humaniseDuration(months: number): string {
  if (months >= 999) return 'In perpetuity';
  if (months === 12) return '1 year';
  if (months > 0 && months % 12 === 0) return `${months / 12} years`;
  return `${months} month${months === 1 ? '' : 's'}`;
}

// snake_case channel keys → readable labels. Anything not in this map
// is humanised via underscore-to-space + title case so a new channel
// added to the LLM prompt doesn't render raw.
const CHANNEL_LABELS: Record<string, string> = {
  social_organic: 'Organic social',
  social_paid: 'Paid social',
  social: 'Social',
  edm: 'EDM',
  billboard: 'Billboards',
  pos: 'POS / In-store',
  press: 'Press',
  tv: 'TV',
  radio: 'Radio',
  hoarding: 'Hoardings',
  pr_earned: 'Earned PR',
  ooh: 'OOH',
};

function humaniseChannel(c: string): string {
  return CHANNEL_LABELS[c] ?? c.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

const CATEGORY_LABELS: Record<string, string> = {
  online: 'Online',
  broadcast: 'Broadcast',
  print: 'Print',
  outdoor: 'Outdoor',
  ambient: 'Ambient',
};

// ISO → full country name for the small set we actually use. Anything
// else falls back to the raw ISO so "AU + UK + NZ" still reads clean.
const ISO_LABELS: Record<string, string> = {
  AU: 'Australia',
  NZ: 'New Zealand',
  US: 'United States',
  UK: 'United Kingdom',
  GB: 'United Kingdom',
  CA: 'Canada',
  WW: 'Worldwide',
  EU: 'Europe',
  EMEA: 'EMEA',
  APAC: 'APAC',
  ANZ: 'Australia + New Zealand',
};

function humaniseIso(c: string): string {
  return ISO_LABELS[c] ?? c;
}

const REALM_LABELS: Record<string, string> = {
  advertising: 'advertising',
  promotional: 'promotional',
  pr: 'PR',
  corporate: 'corporate',
  editorial: 'editorial',
};

const MARKET_LABELS: Record<string, string> = {
  consumer: 'Consumer',
  trade: 'Trade',
  editorial: 'Editorial',
};

function joinList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} + ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} + ${items[items.length - 1]}`;
}

export default function UsageSummary({
  market, realm, mediaCategories, specificChannels, territoryIso, durationMonths, layout = 'horizontal',
}: Props) {
  const territories = (territoryIso ?? []).filter(Boolean);
  const categories = (mediaCategories ?? []).filter(Boolean);
  const channels = (specificChannels ?? []).filter(Boolean);
  const hasDuration = typeof durationMonths === 'number' && durationMonths > 0;

  const hasAny =
    market != null ||
    realm != null ||
    territories.length > 0 ||
    categories.length > 0 ||
    channels.length > 0 ||
    hasDuration;

  if (!hasAny) {
    return (
      <div
        className={layout === 'horizontal' ? 'px-2.5 py-1.5 flex items-start gap-3' : 'py-1'}
        style={layout === 'horizontal' ? undefined : undefined}
      >
        {layout === 'horizontal' && (
          <span
            className="text-[10px] font-semibold uppercase tracking-wider flex-none"
            style={{ color: PALETTE.muted, width: 130 }}
          >
            Usage
          </span>
        )}
        <span className="text-[12px]" style={{ color: PALETTE.muted }}>—</span>
      </div>
    );
  }

  // Line 1 — duration + territories on the same line. e.g.
  //   "6 months · Australia + New Zealand"
  //   "1 year · Australia"
  //   (territory only) "Australia"
  //   (duration only) "6 months"
  // Pairs naturally: duration is "how long", territory is "where" — both
  // scope the licence.
  const durationLabel = hasDuration ? humaniseDuration(durationMonths as number) : null;
  const territoriesJoined = territories.length > 0
    ? joinList(territories.map(humaniseIso))
    : null;
  const territoriesLine = [durationLabel, territoriesJoined].filter(Boolean).join(' · ') || null;

  // Line 2 — media: categories with channels grouped in parens after each
  // applicable category. e.g. "Online (Paid social, EDM), Print, Outdoor"
  // Channels don't map perfectly to categories — pos belongs to outdoor,
  // social_* to online, etc. — so we just append all channels after the
  // first category that has any. Simple, readable, no false structure.
  let mediaLine: string | null = null;
  if (categories.length > 0 || channels.length > 0) {
    const cats = categories.map((c) => CATEGORY_LABELS[c] ?? c);
    const chans = channels.map(humaniseChannel);
    if (cats.length === 0) {
      mediaLine = chans.join(', ');
    } else if (chans.length === 0) {
      mediaLine = cats.join(', ');
    } else {
      // Attach all channels to the first category as a parenthetical hint.
      mediaLine = `${cats[0]} (${chans.join(', ')})${cats.length > 1 ? ', ' + cats.slice(1).join(', ') : ''}`;
    }
  }

  // Line 3 — market + realm. e.g. "Consumer advertising"
  let marketLine: string | null = null;
  if (market || realm) {
    const m = market ? MARKET_LABELS[market] : '';
    const r = realm ? REALM_LABELS[realm] : '';
    marketLine = `${m}${m && r ? ' ' : ''}${r}`.trim();
  }

  const lines = [territoriesLine, mediaLine, marketLine].filter((l): l is string => Boolean(l));

  return (
    <div className={layout === 'horizontal' ? 'px-2.5 py-1.5 flex items-start gap-3' : 'py-1'}>
      {layout === 'horizontal' && (
        <span
          className="text-[10px] font-semibold uppercase tracking-wider flex-none"
          style={{ color: PALETTE.muted, width: 130 }}
        >
          Usage
        </span>
      )}
      <div className="flex-1 min-w-0 space-y-0.5">
        {lines.map((line, i) => (
          <div
            key={i}
            className="text-[12px]"
            style={{ color: i === 0 ? PALETTE.text : PALETTE.muted }}
          >
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}
