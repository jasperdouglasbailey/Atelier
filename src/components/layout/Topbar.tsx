export default function Topbar({ title }: { title: string }) {
  return (
    <header
      className="flex h-14 items-center border-b px-6"
      style={{ background: '#1a1d27', borderColor: '#2e3347' }}
    >
      <h1 className="text-sm font-medium" style={{ color: '#e8eaed' }}>
        {title}
      </h1>
    </header>
  );
}
