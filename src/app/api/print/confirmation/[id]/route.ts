import { type NextRequest } from 'next/server';
import { getCurrentAppUser } from '@/lib/data/app-users';
import { getBooking } from '@/lib/data/bookings';
import { renderPdf, parseCookies } from '@/lib/utils/pdf-renderer';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [appUser, booking] = await Promise.all([getCurrentAppUser(), getBooking(id)]);
  if (!appUser || (appUser.role !== 'owner' && appUser.role !== 'partner')) {
    return new Response('Forbidden', { status: 403 });
  }
  if (!booking) return new Response('Not found', { status: 404 });

  const origin = new URL(req.url).origin;
  const printUrl = `${origin}/print/bookings/${id}/confirmation?pdf=1`;
  const cookieHeader = req.headers.get('cookie') ?? '';

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderPdf(printUrl, parseCookies(cookieHeader, new URL(req.url).hostname));
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'PDF render failed';
    return new Response(`PDF render failed: ${msg}`, { status: 500 });
  }

  const ref = booking.booking_ref ?? id.slice(0, 8);
  return new Response(pdfBuffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="confirmation-${ref}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
