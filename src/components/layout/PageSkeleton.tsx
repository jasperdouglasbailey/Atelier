/**
 * Generic page-load skeleton.
 *
 * Rendered instantly by Next.js while a server component is preparing.
 * Matches the rough shape of every dashboard page (topbar + content area)
 * so the layout doesn't shift when the real content arrives.
 *
 * Variants:
 *   list  — for /bookings, /talent, /crew, /clients (cards/rows)
 *   detail — for /bookings/[id], /talent/[id] (sections stack)
 *   dashboard — for / (stat cards + activity)
 */

import { PALETTE } from '@/lib/utils/constants';

type Variant = 'list' | 'detail' | 'dashboard';

const skeletonStyle = {
  background: PALETTE.surface,
  borderColor: PALETTE.border,
};

function Pulse({ className = '', height = '1rem' }: { className?: string; height?: string }) {
  return (
    <div
      className={`animate-pulse rounded ${className}`}
      style={{ background: PALETTE.border, height, opacity: 0.6 }}
    />
  );
}

function TopbarSkeleton() {
  return (
    <header
      className="flex h-14 items-center gap-3 border-b px-4 sm:px-6"
      style={{ background: 'var(--p-surface)', borderColor: 'var(--p-border)' }}
    >
      <Pulse className="w-32" height="0.875rem" />
    </header>
  );
}

function ListSkeleton() {
  return (
    <div className="p-4 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-lg border p-4 space-y-2" style={skeletonStyle}>
            <Pulse className="w-3/4" height="1rem" />
            <Pulse className="w-1/2" height="0.75rem" />
            <Pulse className="w-2/3" height="0.75rem" />
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="p-4 sm:p-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border p-4 space-y-3" style={skeletonStyle}>
              <Pulse className="w-1/3" height="0.75rem" />
              <Pulse className="w-full" height="0.875rem" />
              <Pulse className="w-2/3" height="0.875rem" />
            </div>
          ))}
        </div>
        <div className="space-y-4">
          <div className="rounded-lg border p-4 space-y-2" style={skeletonStyle}>
            <Pulse className="w-1/2" height="0.75rem" />
            <Pulse className="w-full" height="0.75rem" />
            <Pulse className="w-3/4" height="0.75rem" />
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border p-4 space-y-2" style={skeletonStyle}>
            <Pulse className="w-2/3" height="0.6rem" />
            <Pulse className="w-1/3" height="1.5rem" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border p-4 space-y-2" style={skeletonStyle}>
        <Pulse className="w-1/4" height="0.6rem" />
        <div className="flex gap-2">
          <Pulse className="w-24" height="1.5rem" />
          <Pulse className="w-24" height="1.5rem" />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border p-4 space-y-2" style={skeletonStyle}>
          <Pulse className="w-1/3" height="0.6rem" />
          <Pulse className="w-full" height="3rem" />
        </div>
        <div className="rounded-lg border p-4 space-y-2" style={skeletonStyle}>
          <Pulse className="w-1/3" height="0.6rem" />
          <Pulse className="w-full" height="3rem" />
        </div>
      </div>
    </div>
  );
}

export default function PageSkeleton({ variant = 'list' }: { variant?: Variant }) {
  return (
    <>
      <TopbarSkeleton />
      {variant === 'list' && <ListSkeleton />}
      {variant === 'detail' && <DetailSkeleton />}
      {variant === 'dashboard' && <DashboardSkeleton />}
    </>
  );
}
