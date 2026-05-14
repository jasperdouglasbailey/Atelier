/**
 * Shared PDF renderer for all print templates.
 *
 * Performance optimisations vs the original quote-only implementation:
 *   - Block unnecessary resource types (images, fonts, media) in headless
 *     Chromium — our print pages use system fonts only, so font files and
 *     remote images just add round-trip latency.
 *   - Use 'load' instead of 'networkidle0'. Our print pages are fully
 *     server-rendered; all content is in the initial HTML. networkidle0
 *     waits for ALL in-flight requests to settle (analytics, beacons, etc.)
 *     which can add 2–5s of unnecessary wait.
 *   - Parallel auth + booking lookups at the route level (done by callers).
 *   - Spawn browser once per request; always close in finally block.
 */

type ParsedCookie = { name: string; value: string; domain: string };

export function parseCookies(header: string, domain: string): ParsedCookie[] {
  return header
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const eq = part.indexOf('=');
      if (eq === -1) return null;
      return { name: part.slice(0, eq), value: part.slice(eq + 1), domain };
    })
    .filter((c): c is ParsedCookie => c !== null);
}

export async function renderPdf(url: string, cookies: ParsedCookie[]): Promise<Buffer> {
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

  const puppeteer = (await import('puppeteer-core')).default;

  let executablePath: string | undefined;
  let args: string[] = [];
  if (isServerless) {
    const chromium = (await import('@sparticuz/chromium')).default;
    executablePath = await chromium.executablePath();
    args = chromium.args;
  } else {
    executablePath = process.env.PUPPETEER_EXECUTABLE_PATH
      ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    args = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];
  }

  const browser = await puppeteer.launch({ args, executablePath, headless: true });

  try {
    const page = await browser.newPage();

    // Block resource types that add latency but don't affect our text-only print layout.
    // Our templates use system-ui font stack — no web font round-trips needed.
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (type === 'image' || type === 'media' || type === 'font') {
        req.abort();
      } else {
        req.continue();
      }
    });

    if (cookies.length > 0) await page.setCookie(...cookies);

    // 'load' fires once the page's HTML + CSS is parsed — sufficient for
    // fully server-rendered pages. networkidle0 adds unnecessary wait for
    // analytics/beacons that fire after initial load.
    await page.goto(url, { waitUntil: 'load', timeout: 20_000 });

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
