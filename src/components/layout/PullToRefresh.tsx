'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { PALETTE } from '@/lib/utils/constants';

const PULL_THRESHOLD = 72; // px to trigger refresh
const AUTO_REFRESH_MS = 5 * 60 * 1000; // refresh data every 5 minutes while app is open

type Indicator = { distance: number; refreshing: boolean };

export default function PullToRefresh() {
  const router = useRouter();
  const [indicator, setIndicator] = useState<Indicator>({ distance: 0, refreshing: false });

  // Refs so touch handlers always have fresh values without needing re-binding.
  const startY = useRef(0);
  const currentDist = useRef(0);
  const isPulling = useRef(false);

  const doRefresh = useCallback(() => {
    setIndicator({ distance: 0, refreshing: true });
    router.refresh();
    // Reset after a moment so the spinner doesn't hang if the refresh is fast.
    setTimeout(() => setIndicator({ distance: 0, refreshing: false }), 1200);
  }, [router]);

  // Auto-refresh every 5 minutes in the background.
  useEffect(() => {
    const id = setInterval(doRefresh, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [doRefresh]);

  // Pull-to-refresh gesture on the scrollable main element.
  useEffect(() => {
    const main = document.querySelector('main');
    if (!main) return;

    const onStart = (e: TouchEvent) => {
      isPulling.current = main.scrollTop === 0;
      startY.current = e.touches[0].clientY;
      currentDist.current = 0;
    };

    const onMove = (e: TouchEvent) => {
      if (!isPulling.current) return;
      const dy = Math.max(0, e.touches[0].clientY - startY.current);
      // Apply resistance so the pull feels physical.
      currentDist.current = Math.min(dy * 0.5, PULL_THRESHOLD * 1.4);
      setIndicator((prev) => ({ ...prev, distance: currentDist.current }));
    };

    const onEnd = () => {
      if (isPulling.current && currentDist.current >= PULL_THRESHOLD) {
        doRefresh();
      } else {
        setIndicator((prev) => ({ ...prev, distance: 0 }));
      }
      isPulling.current = false;
      currentDist.current = 0;
    };

    main.addEventListener('touchstart', onStart, { passive: true });
    main.addEventListener('touchmove', onMove, { passive: true });
    main.addEventListener('touchend', onEnd);
    return () => {
      main.removeEventListener('touchstart', onStart);
      main.removeEventListener('touchmove', onMove);
      main.removeEventListener('touchend', onEnd);
    };
  }, [doRefresh]);

  const { distance, refreshing } = indicator;
  const progress = Math.min(distance / PULL_THRESHOLD, 1);

  if (distance <= 4 && !refreshing) return null;

  const opacity = refreshing ? 1 : progress;
  const label = refreshing ? 'Refreshing…' : progress >= 1 ? 'Release to refresh' : 'Pull to refresh';

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none"
      style={{ paddingTop: `${Math.max(distance, refreshing ? PULL_THRESHOLD : 0) * 0.6}px`, opacity, transition: refreshing ? 'none' : 'opacity 0.1s' }}
    >
      <div
        className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs shadow-md"
        style={{ background: PALETTE.surface, color: PALETTE.muted, border: `1px solid ${PALETTE.border}` }}
      >
        <span
          className="inline-block"
          style={{
            display: 'inline-block',
            animation: refreshing ? 'spin 0.8s linear infinite' : undefined,
            transform: refreshing ? undefined : `rotate(${progress * 240}deg)`,
            transition: refreshing ? undefined : 'transform 0.05s',
            fontSize: 14,
          }}
        >
          ↻
        </span>
        {label}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
