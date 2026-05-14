export default function PrintLoading() {
  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 48px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 40 }}>
        <div>
          <div style={{ width: 180, height: 22, background: '#f0f0f0', borderRadius: 4, marginBottom: 8 }} />
          <div style={{ width: 260, height: 14, background: '#f0f0f0', borderRadius: 4 }} />
        </div>
        <div style={{ width: 80, height: 28, background: '#f0f0f0', borderRadius: 4 }} />
      </div>
      <div style={{ height: 1, background: '#e8e8e8', marginBottom: 32 }} />
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, height: 14, background: '#f0f0f0', borderRadius: 4 }} />
          <div style={{ width: 60, height: 14, background: '#f0f0f0', borderRadius: 4 }} />
          <div style={{ width: 80, height: 14, background: '#f0f0f0', borderRadius: 4 }} />
        </div>
      ))}
    </div>
  );
}
