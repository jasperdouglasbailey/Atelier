'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { seedMockCostsAction } from '@/app/actions/seed';

export default function SeedButton() {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const onClick = () => {
    startTransition(async () => {
      await seedMockCostsAction(false);
      router.refresh();
    });
  };

  return (
    <button
      onClick={onClick}
      disabled={isPending}
      className="rounded-md border px-3 py-1.5 text-xs font-medium transition-opacity disabled:opacity-50"
      style={{ borderColor: 'var(--p-border)', color: 'var(--p-muted)', background: 'transparent' }}
    >
      {isPending ? 'Seeding…' : 'Seed mock data'}
    </button>
  );
}
