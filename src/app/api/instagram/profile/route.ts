/**
 * GET /api/instagram/profile
 *
 * Fetches real-time stats + display name + profile picture for the
 * @saundersandcoagency Instagram account by reading the public OG tags.
 *
 * Instagram now gates the OG meta tags behind the `facebookexternalhit/1.1`
 * User-Agent. Regular browser UAs get the JS-rendered shell with no
 * server-side meta tags — the previous Chrome UA stopped working when
 * Instagram migrated to client-side rendering. The Facebook crawler UA is
 * the canonical way to fetch IG OG previews.
 *
 * Cached for 5 minutes — fresh enough that the grid planner shows
 * accurate-as-of-this-session numbers, polite enough that IG doesn't
 * rate-limit us. Force-refresh available via `?refresh=1`.
 */

import { getCurrentAppUser } from '@/lib/data/app-users';

export const dynamic = 'force-dynamic';

const IG_HANDLE = 'saundersandcoagency';
const IG_URL = `https://www.instagram.com/${IG_HANDLE}/`;
const CACHE_TTL_SECONDS = 300; // 5 minutes

type ProfileStats = {
  posts: string;
  followers: string;
  following: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  fetchedAt: string;
};

function parseOgDescription(desc: string): Omit<ProfileStats, 'handle' | 'displayName' | 'avatarUrl' | 'fetchedAt'> | null {
  // Examples seen in the wild:
  //   "6,327 Followers, 5,217 Following, 668 Posts - See Instagram photos..."
  //   "12.4K Followers, 318 Following, 84 Posts — See Instagram photos..."
  const followerMatch = desc.match(/([\d.,KMkm]+)\s*[Ff]ollowers?/);
  const followingMatch = desc.match(/([\d.,KMkm]+)\s*[Ff]ollowing/);
  const postsMatch    = desc.match(/([\d.,KMkm]+)\s*[Pp]osts?/);
  if (!followerMatch && !postsMatch) return null;
  return {
    followers: followerMatch?.[1] ?? '—',
    following: followingMatch?.[1] ?? '—',
    posts:     postsMatch?.[1] ?? '—',
  };
}

/** Parse the og:title to extract the display name. IG format:
 *  "Saunders & Co (@saundersandcoagency) • Instagram photos and videos" */
function parseDisplayName(ogTitle: string): string | null {
  const m = ogTitle.match(/^(.+?)\s*\(@/);
  return m?.[1]?.replace(/&amp;/g, '&').trim() ?? null;
}

function extractOgContent(html: string, property: string): string | null {
  // Match either property-then-content or content-then-property attribute order.
  const re1 = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i');
  return html.match(re1)?.[1] ?? html.match(re2)?.[1] ?? null;
}

/** HTML-decode the common entities IG returns in its meta tags. */
function htmlDecode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

export async function GET(request: Request) {
  // Owner/partner only. The endpoint issues an outbound fetch to
  // instagram.com on every call — unauthenticated, it's a trivial
  // resource-exhaustion vector against this server and a way to get the
  // agency IP rate-limited by IG. The only legitimate caller is the
  // Grid Planner admin UI.
  const appUser = await getCurrentAppUser();
  if (!appUser || (appUser.role !== 'owner' && appUser.role !== 'partner')) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const forceRefresh = url.searchParams.has('refresh');

  try {
    const res = await fetch(IG_URL, {
      headers: {
        // The Facebook crawler UA is the only way to get OG meta tags
        // from Instagram since their late-2024 client-rendering migration.
        // Regular browser UAs get the JS shell with empty server-rendered head.
        'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-AU,en;q=0.9',
      },
      // 8-second timeout — IG is usually <1s with the FB UA
      signal: AbortSignal.timeout(8000),
      // Bypass Next.js's fetch cache when the client passed ?refresh=1
      cache: forceRefresh ? 'no-store' : 'default',
      next: { revalidate: forceRefresh ? 0 : CACHE_TTL_SECONDS },
    });

    if (!res.ok) {
      return Response.json(
        { error: `Instagram returned ${res.status}`, fallback: true },
        { status: 200 },
      );
    }

    const html = await res.text();

    const ogDescription = extractOgContent(html, 'og:description');
    const ogTitle = extractOgContent(html, 'og:title');
    const ogImage = extractOgContent(html, 'og:image');

    if (!ogDescription) {
      return Response.json({ error: 'og:description not found', fallback: true }, { status: 200 });
    }

    const stats = parseOgDescription(ogDescription);
    if (!stats) {
      return Response.json({ error: 'Could not parse stats', raw: ogDescription, fallback: true }, { status: 200 });
    }

    const body: ProfileStats = {
      handle: IG_HANDLE,
      displayName: ogTitle ? parseDisplayName(htmlDecode(ogTitle)) : null,
      avatarUrl: ogImage ? htmlDecode(ogImage) : null,
      ...stats,
      fetchedAt: new Date().toISOString(),
    };

    return Response.json(body, {
      headers: {
        // Edge / CDN cache: 5 min fresh, 1 hour stale-while-revalidate.
        // Force-refresh requests bypass this via cache: 'no-store' above
        // AND the dynamic export, so the client always gets live data
        // when it explicitly asks.
        'Cache-Control': forceRefresh
          ? 'no-store'
          : `public, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=3600`,
      },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'fetch failed', fallback: true },
      { status: 200 },
    );
  }
}
