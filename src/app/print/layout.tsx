/**
 * Minimal layout for print/preview pages — no sidebar, white background.
 * Overrides the dark theme applied by the root layout.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
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
  );
}
