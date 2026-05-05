import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Middleware — auth enforcement + session refresh.
 *
 * - Unauthenticated requests to anything that isn't a public path get
 *   redirected to /login. The original URL is passed as ?next= so the
 *   user lands where they intended after signing in.
 * - Authenticated requests pass through. The session cookie is refreshed
 *   automatically on every request (sliding window).
 *
 * Public paths (no auth required):
 *   - /login
 *   - /api/auth/* (magic-link confirm, sign-out, OAuth callbacks)
 *   - /api/health (uptime monitors)
 *   - /api/cron/* (server-to-server; protected by CRON_SECRET Bearer token)
 *   - /onboard/* (talent/crew secure-URL onboarding — has its own token gate)
 *   - /q/* (FUTURE: tokenized public quote viewer for clients)
 *   - Static asset paths (matcher excludes _next/static, _next/image, favicon)
 */

const PUBLIC_PATHS = ['/login', '/api/auth', '/api/health', '/api/cron', '/onboard', '/q'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase env isn't configured yet, pass everything through —
  // the app surfaces a clear error on the login page rather than crashing.
  if (!url || !key) {
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  // Authed users hitting /login → bounce to dashboard.
  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Unauthed users hitting a private path → redirect to /login with ?next=
  if (!user && !isPublicPath(pathname)) {
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') {
      loginUrl.searchParams.set('next', pathname + request.nextUrl.search);
    }
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
