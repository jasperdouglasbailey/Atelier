/**
 * EDM templates — payload shapes + HTML renderers.
 *
 * Hand-written table-based HTML with inline styles, no email-builder
 * dependency. Two templates only; bringing in react-email or MJML for
 * this volume is not justified.
 *
 * Image rule: every image is referenced by its **Drive thumbnail URL**
 * (e.g. https://lh3.googleusercontent.com/d/<fileId>=w1200). Gmail
 * proxies images through its own cache, so direct lh3 thumbs work
 * reliably. The composer resolves Drive file IDs → thumbnail URLs at
 * pick time.
 */
import { getAgencyConfig } from '@/lib/utils/agency-config';
import type { EdmTemplate } from '@/lib/types/database';

// ============================================================
// Payload shapes
// ============================================================

export type EdmImage = {
  /** Drive file id — kept so the composer can re-render thumbnails at different sizes. */
  fileId: string;
  /** Resolved render URL (lh3 thumbnail). */
  url: string;
  /** Optional caption shown below the image. */
  caption?: string;
  /** Optional link the image should hyperlink to. */
  href?: string;
};

export type MonthlyRoundupPayload = {
  /** Single hero image at the top. */
  hero?: EdmImage;
  /** "October 2026" — shown above the headline. */
  edition?: string;
  /** Headline copy, plain text. */
  headline?: string;
  /** Lede paragraph, plain text. Newlines become <br>. */
  intro?: string;
  /** Up to ~6 entries; each = artist or project being highlighted. */
  entries?: Array<{
    image?: EdmImage;
    title?: string;
    body?: string;
    cta_label?: string;
    cta_href?: string;
  }>;
  /** Plain-text closer paragraph. */
  signoff?: string;
};

export type ArtistCampaignPayload = {
  /** Headline image. */
  hero?: EdmImage;
  /** Eyebrow above headline, eg. "New campaign". */
  eyebrow?: string;
  /** Headline copy. */
  headline?: string;
  /** Sub-headline, eg. artist name or client. */
  subhead?: string;
  /** Body copy. Newlines → <br>. */
  body?: string;
  /** Up to ~6 gallery images. */
  gallery?: EdmImage[];
  /** Single CTA at the bottom. */
  cta_label?: string;
  cta_href?: string;
  /** Plain-text closer. */
  signoff?: string;
};

export type EdmPayload<T extends EdmTemplate = EdmTemplate> =
  T extends 'monthly_roundup' ? MonthlyRoundupPayload
  : T extends 'artist_campaign' ? ArtistCampaignPayload
  : never;

// ============================================================
// Helpers
// ============================================================

const SAFE_TEXT_LIMIT = 5000;

function esc(s: string | undefined | null): string {
  if (s == null) return '';
  return String(s)
    .slice(0, SAFE_TEXT_LIMIT)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escMultiline(s: string | undefined | null): string {
  return esc(s).replace(/\n/g, '<br>');
}

/** Wrap an href in a tracking-friendly form. Honours absolute URLs only. */
function safeHref(href: string | undefined | null): string | null {
  if (!href) return null;
  const v = String(href).trim();
  if (!/^https?:\/\//i.test(v)) return null;
  return v;
}

const COLOR = {
  bg: '#f5f3ef',       // page background
  card: '#ffffff',     // content card
  border: '#e6e1d8',
  text: '#1a1916',
  muted: '#6c6862',
  accent: '#C4A882',
};

const SHELL_OPEN = (preheader: string) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>EDM</title>
</head>
<body style="margin:0;padding:0;background:${COLOR.bg};font-family:Georgia,'Times New Roman',Times,serif;color:${COLOR.text};">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${esc(preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${COLOR.bg};">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:${COLOR.card};border:1px solid ${COLOR.border};">
`;

const SHELL_CLOSE = (footer: string) => `
<tr><td style="padding:24px 32px;background:${COLOR.bg};border-top:1px solid ${COLOR.border};font-size:11px;color:${COLOR.muted};line-height:1.6;text-align:center;">
${footer}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

function imageBlock(img: EdmImage | undefined, width = 536): string {
  if (!img?.url) return '';
  const inner = `<img src="${esc(img.url)}" width="${width}" alt="" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;">`;
  const linked = safeHref(img.href)
    ? `<a href="${esc(img.href)}" style="text-decoration:none;color:inherit;">${inner}</a>`
    : inner;
  // Captions only render when the user has explicitly set one. We no
  // longer auto-fill from filename, so this is empty by default.
  const cap = img.caption?.trim()
    ? `<div style="padding:8px 0 0;font-size:12px;color:${COLOR.muted};line-height:1.5;">${esc(img.caption)}</div>`
    : '';
  // 32px horizontal padding so images line up with section dividers and
  // body copy. Width of inner image stays at 536px to fit (600 - 64).
  return `<tr><td style="padding:0 32px;">${linked}${cap}</td></tr>`;
}

function button(label: string | undefined, href: string | undefined): string {
  const safe = safeHref(href);
  if (!safe || !label?.trim()) return '';
  return `<tr><td style="padding:8px 32px 24px;">
<a href="${esc(safe)}" style="display:inline-block;padding:11px 22px;background:${COLOR.accent};color:#1a1916;text-decoration:none;font-size:13px;font-weight:600;letter-spacing:0.04em;">${esc(label)}</a>
</td></tr>`;
}

function footerBlock(): string {
  const cfg = getAgencyConfig();
  // Uppercase BEFORE escaping — esc() turns '&' into '&amp;' and a
  // subsequent .toUpperCase() would produce '&AMP;', which some email
  // clients render literally instead of unescaping. Doing it in this
  // order produces 'SAUNDERS &amp; CO' → 'SAUNDERS & CO' in the inbox.
  const nameUpper = esc(cfg.name.toUpperCase());

  const linkStyle = `color:${COLOR.muted};text-decoration:none;border-bottom:1px solid ${COLOR.border};padding-bottom:1px;`;
  const links: string[] = [];
  if (cfg.website) {
    links.push(`<a href="https://${esc(cfg.website)}" style="${linkStyle}">${esc(cfg.website)}</a>`);
  }
  if (cfg.instagram) {
    links.push(`<a href="https://instagram.com/${esc(cfg.instagram)}" style="${linkStyle}">Instagram</a>`);
  }
  if (cfg.linkedin) {
    links.push(`<a href="https://linkedin.com/company/${esc(cfg.linkedin)}" style="${linkStyle}">LinkedIn</a>`);
  }

  const parts = [
    `<strong style="color:${COLOR.text};letter-spacing:0.12em;">${nameUpper}</strong>`,
    cfg.address ? esc(cfg.address) : '',
    links.length ? links.join(' &nbsp;·&nbsp; ') : '',
  ].filter(Boolean);

  return parts.join('<br>');
}

// ============================================================
// Renderers
// ============================================================

function renderMonthlyRoundup(p: MonthlyRoundupPayload, preheader: string): string {
  const entries = (p.entries ?? []).slice(0, 6);
  return SHELL_OPEN(preheader) +
    imageBlock(p.hero) +
    `<tr><td style="padding:28px 32px 4px;">
${p.edition ? `<div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${COLOR.muted};margin-bottom:10px;">${esc(p.edition)}</div>` : ''}
${p.headline ? `<h1 style="margin:0 0 12px;font-size:26px;line-height:1.25;font-weight:700;color:${COLOR.text};">${esc(p.headline)}</h1>` : ''}
${p.intro ? `<p style="margin:0;font-size:15px;line-height:1.7;color:${COLOR.text};">${escMultiline(p.intro)}</p>` : ''}
</td></tr>` +
    entries.map((e) => {
      const cta = button(e.cta_label, e.cta_href);
      return `
<tr><td style="padding:24px 32px 8px;"><hr style="border:0;border-top:1px solid ${COLOR.border};margin:0;"></td></tr>
${imageBlock(e.image)}
<tr><td style="padding:16px 32px 0;">
${e.title ? `<h2 style="margin:0 0 8px;font-size:19px;font-weight:700;color:${COLOR.text};">${esc(e.title)}</h2>` : ''}
${e.body ? `<p style="margin:0;font-size:15px;line-height:1.7;color:${COLOR.text};">${escMultiline(e.body)}</p>` : ''}
</td></tr>
${cta}
`;
    }).join('') +
    (p.signoff
      ? `<tr><td style="padding:24px 32px 32px;font-size:14px;line-height:1.7;color:${COLOR.text};">${escMultiline(p.signoff)}</td></tr>`
      : '<tr><td style="padding:0 0 16px;">&nbsp;</td></tr>') +
    SHELL_CLOSE(footerBlock());
}

function renderArtistCampaign(p: ArtistCampaignPayload, preheader: string): string {
  const gallery = (p.gallery ?? []).slice(0, 6);
  // Render gallery as 2-column table pairs
  const galleryRows: string[] = [];
  for (let i = 0; i < gallery.length; i += 2) {
    const left = gallery[i];
    const right = gallery[i + 1];
    galleryRows.push(`<tr><td style="padding:6px 32px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr>
<td valign="top" style="padding:0 6px 0 0;width:50%;">
${left ? `<img src="${esc(left.url)}" alt="" width="262" style="display:block;width:100%;height:auto;border:0;">` : ''}
</td>
<td valign="top" style="padding:0 0 0 6px;width:50%;">
${right ? `<img src="${esc(right.url)}" alt="" width="262" style="display:block;width:100%;height:auto;border:0;">` : ''}
</td>
</tr>
</table>
</td></tr>`);
  }

  return SHELL_OPEN(preheader) +
    imageBlock(p.hero) +
    `<tr><td style="padding:28px 32px 4px;">
${p.eyebrow ? `<div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${COLOR.muted};margin-bottom:10px;">${esc(p.eyebrow)}</div>` : ''}
${p.headline ? `<h1 style="margin:0 0 6px;font-size:28px;line-height:1.2;font-weight:700;color:${COLOR.text};">${esc(p.headline)}</h1>` : ''}
${p.subhead ? `<div style="font-size:15px;color:${COLOR.muted};margin-bottom:14px;font-style:italic;">${esc(p.subhead)}</div>` : ''}
${p.body ? `<p style="margin:0;font-size:15px;line-height:1.7;color:${COLOR.text};">${escMultiline(p.body)}</p>` : ''}
</td></tr>` +
    (galleryRows.length ? `<tr><td style="padding:20px 0 4px;">&nbsp;</td></tr>${galleryRows.join('')}` : '') +
    button(p.cta_label, p.cta_href) +
    (p.signoff
      ? `<tr><td style="padding:24px 32px 32px;font-size:14px;line-height:1.7;color:${COLOR.text};">${escMultiline(p.signoff)}</td></tr>`
      : '<tr><td style="padding:0 0 16px;">&nbsp;</td></tr>') +
    SHELL_CLOSE(footerBlock());
}

// ============================================================
// Public API
// ============================================================

export const EDM_TEMPLATE_LABELS: Record<EdmTemplate, string> = {
  monthly_roundup: 'Monthly round-up',
  artist_campaign: 'Artist / campaign',
};

export function renderEdmHtml(
  template: EdmTemplate,
  payload: unknown,
  preheader: string | null,
): string {
  const ph = preheader ?? '';
  if (template === 'monthly_roundup') {
    return renderMonthlyRoundup((payload as MonthlyRoundupPayload) ?? {}, ph);
  }
  return renderArtistCampaign((payload as ArtistCampaignPayload) ?? {}, ph);
}

/** Convert a Drive file id to the public thumbnail URL Gmail can fetch. */
export function driveThumbUrl(fileId: string, width = 1200): string {
  return `https://lh3.googleusercontent.com/d/${encodeURIComponent(fileId)}=w${width}`;
}
