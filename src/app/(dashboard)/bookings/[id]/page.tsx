import Topbar from '@/components/layout/Topbar';

export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <>
      <Topbar title={`Booking ${id}`} />
      <div className="p-6">
        <p className="text-sm" style={{ color: '#9aa0b4' }}>Coming soon</p>
      </div>
    </>
  );
}
