/**
 * GET /api/instagram/profile
 *
 * Fetches real-time follower / following / post counts for the
 * @saundersandcoagency Instagram account by scraping the public
 * profile page og:description meta tag.
 *
 * Instagram embeds stats in the og:description in the format:
 *   "12.4K Followers, 318 Following, 84 Posts — See Instagram photos…"
 *
 * Cached for 30 minutes (revalidate: 1800) so we don't hammer IG on
 * every page load.
 */

export const dynamic = 'force-dynamic';
export const revalidate = 1800; // 30 min

const IG_HANDLE = 'saundersandcoagency';
const IG_URL = `https://www.instagram.com/${IG_HANDLE}/`;

type ProfileStats = {
  posts: string;
  followers: string;
  following: string;
  handle: string;
};

function parseOgDescription(desc: string): Omit<ProfileStats, 'handle'> | null {
  // "12.4K Followers, 318 Following, 84 Posts - See Instagram photos..."
  // Also seen: "84 Posts, 12.4K Followers, 318 Following"
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

export async function GET() {
  try {
    const res = await fetch(IG_URL, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-AU,en;q=0.9',
      },
      // 8-second timeout
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return Response.json(
        { error: `Instagram returned ${res.status}`, fallback: true },
        { status: 200 },
      );
    }

    const html = await res.text();

    // Extract og:description
    const ogMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i);

    if (!ogMatch) {
      return Response.json({ error: 'og:description not found', fallback: true }, { status: 200 });
    }

    const stats = parseOgDescription(ogMatch[1]);
    if (!stats) {
      return Response.json({ error: 'Could not parse stats', raw: ogMatch[1], fallback: true }, { status: 200 });
    }

    const body: ProfileStats = { handle: IG_HANDLE, ...stats };
    return Response.json(body, {
      headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'fetch failed', fallback: true },
      { status: 200 },
    );
  }
}
