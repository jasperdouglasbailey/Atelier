/**
 * Reusable search/filter row for listing pages.
 *
 * Server-rendered form: GET submission rebuilds the URL with the new
 * query string, which re-renders the page with filtered data. No client
 * JS needed; native browser behaviour just works.
 *
 * Optional `filters` slot accepts <select> elements (or any inputs) for
 * additional dropdowns alongside the search field.
 */

import { PALETTE } from '@/lib/utils/constants';

type Props = {
  searchValue?: string;
  searchPlaceholder?: string;
  /** Hidden inputs that should persist across the search submit. */
  hiddenParams?: Record<string, string>;
  filters?: React.ReactNode;
  count?: number;
  countLabel?: string;
  rightSlot?: React.ReactNode;
};

export default function ListSearchBar({
  searchValue,
  searchPlaceholder = 'Search…',
  hiddenParams,
  filters,
  count,
  countLabel,
  rightSlot,
}: Props) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <form className="flex flex-1 flex-wrap items-center gap-2" method="get">
        {hiddenParams &&
          Object.entries(hiddenParams).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        <input
          type="text"
          name="search"
          placeholder={searchPlaceholder}
          defaultValue={searchValue}
          className="min-w-0 flex-1 rounded-md border bg-transparent px-3 py-2 text-sm sm:max-w-xs"
          style={{ borderColor: PALETTE.border, color: PALETTE.text }}
        />
        {filters}
        <button
          type="submit"
          className="rounded-md px-3 py-2 text-xs font-medium"
          style={{ background: PALETTE.accent, color: PALETTE.bg }}
        >
          Apply
        </button>
        {searchValue && (
          <a
            href="?"
            className="text-xs underline"
            style={{ color: PALETTE.muted }}
          >
            Clear
          </a>
        )}
      </form>
      <div className="flex items-center gap-3">
        {typeof count === 'number' && (
          <span className="text-xs" style={{ color: PALETTE.muted }}>
            {count} {countLabel ?? 'result'}
            {count === 1 ? '' : 's'}
          </span>
        )}
        {rightSlot}
      </div>
    </div>
  );
}
