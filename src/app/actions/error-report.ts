'use server';

import { captureError } from '@/lib/utils/error-capture';
import { getCurrentActor } from '@/lib/utils/actor';

/**
 * Server action invoked from the client-side error boundary
 * (src/app/error.tsx) so unhandled React render errors get captured
 * to atelier_error_log alongside server-side captures.
 *
 * Fire-and-forget on the client side. Never throws.
 */
export async function reportClientErrorAction(input: {
  message: string;
  stack?: string;
  digest?: string;
  pathname?: string;
}): Promise<void> {
  const userId = await getCurrentActor().catch(() => null);
  await captureError(
    new Error(input.message),
    {
      source: 'client',
      context: input.pathname ?? undefined,
      userId,
      metadata: {
        digest: input.digest ?? null,
        stack_truncated: input.stack ? input.stack.slice(0, 2000) : null,
      },
    },
  );
}
