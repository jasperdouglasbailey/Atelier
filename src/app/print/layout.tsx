/**
 * Minimal layout for print/preview pages — no sidebar, white background.
 *
 * The root layout applies a body-level background driven by the theme toggle
 * (dark = #0a0a0a, light = cream). Print pages must always render on white
 * regardless of theme, including the area below the printable content when
 * the document is shorter than the viewport. We pin html/body backgrounds
 * to white for any /print route via a scoped style block; the wrapper div
 * additionally ensures the visible area covers the full viewport.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Override the theme palette — print is always paper-on-white. */}
      <style>{`
        html, body { background: #ffffff !important; color: #1a1a1a !important; }
      `}</style>
      <div
        className="print-root"
        style={{
          background: '#ffffff',
          color: '#1a1a1a',
          minHeight: '100vh',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        {children}
      </div>
    </>
  );
}
