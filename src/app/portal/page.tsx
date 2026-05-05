import { redirect } from 'next/navigation';
import { getCurrentAppUser } from '@/lib/data/app-users';

export const dynamic = 'force-dynamic';

export default async function PortalIndex() {
  const user = await getCurrentAppUser();
  // Layout already redirects owner/partner to /, so we only get here for talent/crew
  if (user?.role === 'talent') redirect('/portal/talent');
  if (user?.role === 'crew') redirect('/portal/crew');
  redirect('/login?error=not_authorised');
}
