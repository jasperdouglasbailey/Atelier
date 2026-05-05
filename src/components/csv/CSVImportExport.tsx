'use client';

import { useRef, useState } from 'react';
import { importTalentAction, importCrewAction, type ImportResult } from '@/app/actions/import';
import { PALETTE } from '@/lib/utils/constants';
import { useRouter } from 'next/navigation';

type Props = {
  type: 'talent' | 'crew';
};

const TEMPLATE_COLUMNS = {
  talent: 'working_name,legal_name,discipline,specialty,email,mobile,instagram,website,abn,gst_registered,entity_type,representation_status,default_day_rate,is_active,notes',
  crew: 'name,email,mobile,primary_role,tier,abn,gst_registered,default_day_rate,is_active,notes',
};

const VALID_DISCIPLINES = 'photographer | videographer | wardrobe_stylist | hair | makeup | hair_and_makeup | manicurist';
const VALID_TIERS = 'preferred_core | regular_freelance | never_again';

export default function CSVImportExport({ type }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      setImportError('Please upload a .csv file.');
      return;
    }

    setImporting(true);
    setResult(null);
    setImportError(null);

    try {
      const text = await file.text();
      const res = type === 'talent'
        ? await importTalentAction(text)
        : await importCrewAction(text);
      setResult(res);
      if (res.inserted > 0) router.refresh();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
      // Reset file input so same file can be re-selected
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function downloadTemplate() {
    const cols = TEMPLATE_COLUMNS[type];
    const blob = new Blob([cols + '\r\n'], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `atelier-${type}-import-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex items-center gap-2">
      {/* Export */}
      <a
        href={`/api/export/${type}`}
        download
        className="rounded px-3 py-1.5 text-xs font-medium"
        style={{ background: `${PALETTE.accent}18`, color: PALETTE.accent, border: `1px solid ${PALETTE.accent}44` }}
      >
        Export CSV
      </a>

      {/* Import trigger */}
      <div className="relative">
        <label
          className="rounded px-3 py-1.5 text-xs font-medium cursor-pointer select-none"
          style={{
            background: importing ? `${PALETTE.muted}18` : `${PALETTE.success}18`,
            color: importing ? PALETTE.muted : PALETTE.success,
            border: `1px solid ${importing ? PALETTE.border : PALETTE.success + '44'}`,
            opacity: importing ? 0.7 : 1,
          }}
        >
          {importing ? 'Importing…' : 'Import CSV'}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleImport}
            disabled={importing}
            className="sr-only"
          />
        </label>
      </div>

      {/* Template download */}
      <button
        onClick={downloadTemplate}
        className="text-[11px] underline decoration-dotted"
        style={{ color: PALETTE.muted }}
        title="Download a blank CSV template with the correct column headers"
      >
        Template
      </button>

      {/* Guide toggle */}
      <button
        onClick={() => setShowGuide((v) => !v)}
        className="text-[11px]"
        style={{ color: PALETTE.muted }}
        title="Show import format guide"
      >
        ?
      </button>

      {/* Results / errors — rendered outside the flex row via portal-like approach */}
      {(result || importError || showGuide) && (
        <div
          className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border p-4 space-y-2 shadow-xl"
          style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: PALETTE.text }}>
              {result ? 'Import complete' : importError ? 'Import error' : `CSV format — ${type}`}
            </span>
            <button
              onClick={() => { setResult(null); setImportError(null); setShowGuide(false); }}
              className="text-xs"
              style={{ color: PALETTE.muted }}
            >
              Close
            </button>
          </div>

          {result && (
            <div className="space-y-1">
              <div className="text-sm" style={{ color: PALETTE.success }}>
                {result.inserted} record{result.inserted !== 1 ? 's' : ''} imported
              </div>
              {result.skipped > 0 && (
                <div className="text-xs" style={{ color: PALETTE.muted }}>
                  {result.skipped} row{result.skipped !== 1 ? 's' : ''} skipped (blank name)
                </div>
              )}
              {result.errors.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs font-medium" style={{ color: PALETTE.warning }}>
                    {result.errors.length} error{result.errors.length !== 1 ? 's' : ''}:
                  </div>
                  <ul className="text-[11px] space-y-0.5" style={{ color: PALETTE.warning }}>
                    {result.errors.slice(0, 5).map((e, i) => <li key={i}>· {e}</li>)}
                    {result.errors.length > 5 && (
                      <li style={{ color: PALETTE.muted }}>…and {result.errors.length - 5} more</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          {importError && (
            <div className="text-sm" style={{ color: PALETTE.danger }}>{importError}</div>
          )}

          {showGuide && (
            <div className="text-[11px] space-y-2" style={{ color: PALETTE.muted }}>
              <p><strong style={{ color: PALETTE.text }}>Required columns:</strong></p>
              {type === 'talent' ? (
                <>
                  <p><code>working_name</code> — artist display name (required)</p>
                  <p><code>discipline</code> — one of: {VALID_DISCIPLINES}</p>
                  <p><code>gst_registered</code> — yes / no</p>
                  <p><code>is_active</code> — yes / no (default: yes)</p>
                  <p><code>default_day_rate</code> — number, AUD</p>
                  <p>All other columns optional.</p>
                </>
              ) : (
                <>
                  <p><code>name</code> — crew member name (required)</p>
                  <p><code>tier</code> — one of: {VALID_TIERS}</p>
                  <p><code>gst_registered</code> — yes / no</p>
                  <p><code>is_active</code> — yes / no (default: yes)</p>
                  <p><code>default_day_rate</code> — number, AUD</p>
                  <p>All other columns optional.</p>
                </>
              )}
              <p className="pt-1">
                Download the <button onClick={downloadTemplate} className="underline" style={{ color: PALETTE.accent }}>blank template</button> to get the correct column order.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
