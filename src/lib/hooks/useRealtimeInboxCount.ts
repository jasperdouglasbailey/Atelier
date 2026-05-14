'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Subscribes to Supabase Realtime changes on atelier_approvals and keeps a
 * live count of pending approvals. Initialises from the server-rendered value
 * so there is no flash on first load; updates without a page refresh whenever
 * an approval is created, resolved, or expired.
 */
export function useRealtimeInboxCount(initialCount: number): number {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    const supabase = createClient();

    async function refetch() {
      const { count: c } = await supabase
        .from('atelier_approvals')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (c !== null) setCount(c);
    }

    const channel = supabase
      .channel('inbox-badge')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'atelier_approvals' },
        () => { void refetch(); },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, []);

  return count;
}
