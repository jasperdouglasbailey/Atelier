'use client';

export default function PrintActions() {
  return (
    <div
      className="no-print"
      style={{
        display: 'flex',
        gap: 8,
        marginBottom: 32,
        paddingBottom: 16,
        borderBottom: '1px solid #e8e8e8',
      }}
    >
      <button
        onClick={() => window.print()}
        style={{
          background: '#1a1a1a',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          padding: '8px 18px',
          fontSize: 13,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        Print / Save PDF
      </button>
      <button
        onClick={() => window.history.back()}
        style={{
          background: 'transparent',
          color: '#666',
          border: '1px solid #ddd',
          borderRadius: 6,
          padding: '8px 18px',
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        ← Back
      </button>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .print-root { background: #fff !important; }
        }
      `}</style>
    </div>
  );
}
