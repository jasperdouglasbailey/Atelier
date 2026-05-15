'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Location, StudioType } from '@/lib/types/database';
import { PALETTE } from '@/lib/utils/constants';
import { humanise } from '@/lib/utils/humanise';

/**
 * Interactive map of every location with a geocoded address.
 *
 * - Each location renders as a small coloured dot, colour-keyed by studio type
 * - Hover/tap → tooltip with name + address
 * - Click → navigates to /locations/[id]
 * - Map auto-fits the bounds of every visible marker on every locations[] change
 * - Locations without lat/lng don't appear here; LocationsClient shows
 *   them in a small "+ N without coords" hint below the map
 *
 * Loaded via dynamic import in LocationsClient so the leaflet bundle only
 * ships on this page. SSR-disabled because Leaflet touches `window` directly.
 */

const STUDIO_TYPE_COLOR: Record<StudioType, string> = {
  photo_studio: '#C4A882',
  film_studio:  '#7B5E8C',
  outdoor:      '#7A9A6B',
  retail:       '#D89E7E',
  residential:  '#9B8367',
  venue:        '#5E7A8C',
  other:        '#8B8B8B',
};

function dotIcon(color: string): L.DivIcon {
  // Two-layer dot: soft halo + crisp coloured core. The halo carries the
  // colour at low opacity so a cluster of dots reads visually grouped without
  // looking like cheap default-Leaflet pins.
  return L.divIcon({
    className: 'atelier-location-dot',
    html: `
      <span style="
        position:relative; display:block; width:22px; height:22px;
      ">
        <span style="
          position:absolute; inset:0; border-radius:50%;
          background:${color}; opacity:0.18;
        "></span>
        <span style="
          position:absolute; top:5px; left:5px; width:12px; height:12px;
          border-radius:50%; background:${color};
          border:2px solid #ffffff;
          box-shadow:0 2px 6px rgba(0,0,0,0.25);
        "></span>
      </span>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

/** Inner helper that imperatively fits the map to all marker bounds. */
function FitBoundsToMarkers({ points }: { points: Array<{ lat: number; lng: number }> }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0]!.lat, points[0]!.lng], 13);
      return;
    }
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }, [map, points]);
  return null;
}

// CartoDB Voyager — pastel base with proper colour (parks green, water blue,
// readable street labels). Free, no API key, retina-aware.
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const TILE_SUBDOMAINS = ['a', 'b', 'c', 'd'];
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> · <a href="https://carto.com/attributions">CARTO</a>';
const TILE_BG = '#eef3f5';

type Props = {
  locations: Location[];
};

export default function LocationsMap({ locations }: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const mapped = useMemo(
    () => locations
      .filter((l) => l.latitude != null && l.longitude != null)
      .map((l) => ({
        id: l.id,
        name: l.name,
        address: [l.address, l.suburb, l.state].filter(Boolean).join(', '),
        type: l.studio_type,
        color: STUDIO_TYPE_COLOR[l.studio_type] ?? STUDIO_TYPE_COLOR.other,
        lat: l.latitude!,
        lng: l.longitude!,
      })),
    [locations],
  );

  // Distinct studio types currently on the map, for the legend
  const legendTypes = useMemo(() => {
    const set = new Set(mapped.map((m) => m.type));
    return Array.from(set).sort();
  }, [mapped]);

  // Default centre — Sydney CBD, used as fallback when there are no markers
  const defaultCentre: [number, number] = [-33.8688, 151.2093];

  if (mapped.length === 0) {
    return (
      <div
        ref={containerRef}
        className="rounded-lg border flex items-center justify-center"
        style={{ background: PALETTE.surface, borderColor: PALETTE.border, height: 360 }}
      >
        <div style={{ textAlign: 'center', color: PALETTE.muted }}>
          <div className="text-sm font-medium" style={{ color: PALETTE.text }}>No locations on the map yet</div>
          <p className="text-[11px] mt-1">Once a location has an address that geocodes successfully, it will appear here.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="rounded-lg border overflow-hidden relative"
      style={{ background: PALETTE.surface, borderColor: PALETTE.border, height: 420 }}
    >
      {/* Inline CSS overrides Leaflet's default tooltip / zoom button styling
          so the map fits the Atelier sand/cream palette instead of looking
          like a 2008 OSM widget. Scoped via the .atelier-map class on the
          MapContainer below. */}
      <style>{`
        .atelier-map .leaflet-tooltip {
          background: ${PALETTE.surface};
          border: 1px solid ${PALETTE.border};
          border-radius: 6px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.12);
          padding: 8px 10px;
          color: ${PALETTE.text};
          font-family: inherit;
        }
        .atelier-map .leaflet-tooltip::before { display: none; }
        .atelier-map .leaflet-control-zoom {
          border: 1px solid ${PALETTE.border} !important;
          border-radius: 6px;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }
        .atelier-map .leaflet-control-zoom a {
          background: ${PALETTE.surface};
          color: ${PALETTE.text};
          width: 28px;
          height: 28px;
          line-height: 28px;
          font-weight: 400;
          font-size: 14px;
          border-bottom: 1px solid ${PALETTE.border};
        }
        .atelier-map .leaflet-control-zoom a:last-child { border-bottom: none; }
        .atelier-map .leaflet-control-zoom a:hover {
          background: ${PALETTE.bg};
          color: ${PALETTE.accent};
        }
        .atelier-map .leaflet-control-attribution {
          background: rgba(255,255,255,0.78) !important;
          font-size: 10px;
          backdrop-filter: blur(4px);
          padding: 1px 6px;
        }
        .atelier-map .leaflet-control-attribution a { color: ${PALETTE.muted}; }
      `}</style>
      <MapContainer
        center={defaultCentre}
        zoom={11}
        scrollWheelZoom
        className="atelier-map"
        style={{ height: '100%', width: '100%', background: TILE_BG }}
      >
        <TileLayer
          attribution={TILE_ATTRIBUTION}
          url={TILE_URL}
          subdomains={TILE_SUBDOMAINS}
          maxZoom={19}
        />
        <FitBoundsToMarkers points={mapped} />
        {mapped.map((m) => (
          <Marker
            key={m.id}
            position={[m.lat, m.lng]}
            icon={dotIcon(m.color)}
            eventHandlers={{
              click: () => router.push(`/locations/${m.id}`),
            }}
          >
            <Tooltip direction="top" offset={[0, -8]} opacity={0.95} sticky>
              <div style={{ fontSize: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>{m.name}</div>
                <div style={{ color: '#666', fontSize: 11 }}>
                  {m.address || <em>No address</em>}
                </div>
                <div style={{ color: '#999', fontSize: 10, marginTop: 3 }}>
                  {humanise(m.type)} · click for details
                </div>
              </div>
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>

      {/* Legend — bottom-left, semi-transparent over the map */}
      {legendTypes.length > 0 && (
        <div
          className="absolute bottom-2 left-2 rounded-md px-2.5 py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1"
          style={{
            background: 'rgba(255,255,255,0.92)',
            border: `1px solid ${PALETTE.border}`,
            backdropFilter: 'blur(4px)',
            zIndex: 1000,
            fontSize: 10,
          }}
        >
          {legendTypes.map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <span
                style={{
                  display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                  background: STUDIO_TYPE_COLOR[t] ?? STUDIO_TYPE_COLOR.other,
                  border: '1.5px solid #fff', boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                }}
              />
              <span style={{ color: '#333' }}>{humanise(t)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
