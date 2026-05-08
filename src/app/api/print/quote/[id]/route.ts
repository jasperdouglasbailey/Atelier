/**
 * Quote PDF download endpoint.
 *
 * Renders the existing /print/bookings/[id]/quote view to PDF using a
 * headless Chromium. Reuses the print-template page so we have a single
 * source of truth for layout — no second React tree to maintain.
 *
 * Two execution paths:
 *   - Dev (local): uses your installed Chromium / Chrome via puppeteer's
 *     bundled browser if present, falling back to a system path.
 *   - Production (Vercel serverless): uses @sparticuz/chromium which
 *     ships a Chromium binary that fits the function size limit.
 *
 * Auth: same as the underlying /print page — gated by the dashboard
 * layout. The user must have an authenticated session to reach this.
 *
 * Output: a downloadable application/pdf response with a sensible
 * filename based on the booking ref.
 */

import { type NextRequest } from 'next/server';
import { getCurrentAppUser } from '@/lib/data/app-users';
import { getBooking } from '@/lib/data/bookings';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // PDF rendering can take 10-20s on cold start

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Auth — owner / partner only. Talent / crew don't see other artists'
  // quote totals (per privacy doctrine in master CLAUDE.md).
  const appUser = await getCurrentAppUser();
  if (!appUser || (appUser.role !== 'owner' && appUser.role !== 'partner')) {
    return new Response('Forbidden', { status: 403 });
  }

  const booking = await getBooking(id);
  if (!booking) return new Response('Not found', { status: 404 });

  // Build the URL of the print page. Same origin as this request.
  const origin = new URL(req.url).origin;
  const printUrl = `${origin}/print/bookings/${id}/quote?pdf=1`;

  // Forward the auth cookie so the print page renders with the same
  // session — otherwise it would 403 from the dashboard layout guard.
  const cookieHeader = req.headers.get('cookie') ?? '';

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderPdf(printUrl, cookieHeader);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'PDF render failed';
    return new Response(`PDF render failed: ${msg}`, { status: 500 });
  }

  const ref = booking.booking_ref ?? id.slice(0, 8);
  const filename = `quote-${ref}.pdf`;
  return new Response(pdfBuffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Headless-Chromium PDF renderer. Uses @sparticuz/chromium on serverless
 * (Vercel detects via process.env.VERCEL or AWS_LAMBDA_FUNCTION_NAME);
 * falls back to a local Chromium path on dev. The local fallback only
 * runs for the developer; production always takes the serverless path.
 */
async function renderPdf(url: string, cookieHeader: string): Promise<Buffer> {
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

  // Dynamic imports so dev installs don't pay the cost on routes that
  // don't render PDFs (these packages are >50MB).
  const puppeteer = (await import('puppeteer-core')).default;

  let executablePath: string | undefined;
  let args: string[] = [];
  if (isServerless) {
    const chromium = (await import('@sparticuz/chromium')).default;
    executablePath = await chromium.executablePath();
    args = chromium.args;
  } else {
    // Dev fallback — try common local paths. If none works the developer
    // can set PUPPETEER_EXECUTABLE_PATH explicitly.
    executablePath = process.env.PUPPETEER_EXECUTABLE_PATH
      ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    args = ['--no-sandbox', '--disable-setuid-sandbox'];
  }

  const browser = await puppeteer.launch({
    args,
    executablePath,
    headless: true,
  });

  try {
    const page = await browser.newPage();

    // Forward the auth cookie so /print/... renders authenticated
    if (cookieHeader) {
      const parsed = parseCookies(cookieHeader, new URL(url).hostname);
      if (parsed.length > 0) await page.setCookie(...parsed);
    }

    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30_000 });

    const pdf = await page.pdf({
      format: 'a4',
      printBackground: true,
      margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => {});
  }
}

function parseCookies(header: string, domain: string): Array<{ name: string; value: string; domain: string }> {
  return header
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const eq = part.indexOf('=');
      if (eq === -1) return null;
      return { name: part.slice(0, eq), value: part.slice(eq + 1), domain };
    })
    .filter((c): c is { name: string; value: string; domain: string } => c !== null);
}
