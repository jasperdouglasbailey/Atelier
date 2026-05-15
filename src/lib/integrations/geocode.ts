/**
 * Address → lat/lng geocoding via Nominatim (OpenStreetMap's geocoding service).
 *
 * Why Nominatim:
 *   - Free, no API key required
 *   - Suitable for an internal agency tool with low volume (a few dozen locations,
 *     re-geocoded only when addresses change)
 *   - Respects ATO doctrine of "minimum required external services"
 *
 * Usage policy:
 *   - Max 1 request/second (we serialise via a tiny in-process delay)
 *   - Must send a User-Agent identifying our application
 *   - https://operations.osmfoundation.org/policies/nominatim/
 */

import { getAgencyConfig } from '@/lib/utils/agency-config';

export type GeocodeResult = {
  latitude: number;
  longitude: number;
  /** Normalised address string Nominatim returned for the query. Useful for sanity-checking. */
  resolvedAddress: string;
};

let lastCallAt = 0;
const MIN_INTERVAL_MS = 1100; // Nominatim asks for max 1 req/sec; pad slightly.

/**
 * Geocode a location's address string. Returns null when the address is empty,
 * Nominatim returned no match, or the request failed.
 *
 * Builds the query from address + suburb + state + postcode + 'Australia' so
 * a partial address ("Sun Studios" + "Alexandria" + "NSW") still locates
 * correctly without needing the full street number.
 */
export async function geocodeAddress(parts: {
  address?: string | null;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
}): Promise<GeocodeResult | null> {
  const query = [parts.address, parts.suburb, parts.state, parts.postcode, 'Australia']
    .filter((p): p is string => Boolean(p && p.trim()))
    .join(', ');

  if (!query.trim()) return null;

  // Serialise calls — Nominatim's TOS is strict on rate limits.
  const now = Date.now();
  const sinceLast = now - lastCallAt;
  if (sinceLast < MIN_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - sinceLast));
  }
  lastCallAt = Date.now();

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'au');

  const agency = getAgencyConfig();
  const userAgent = `Atelier-Platform/${agency.name || 'SaundersAndCo'} (${agency.email || 'admin@atelier.local'})`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
        'Accept-Language': 'en-AU',
      },
      // 10s timeout — geocoding shouldn't block the save UX for longer.
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.error(`[geocode] Nominatim returned ${response.status} for "${query}"`);
      return null;
    }

    const results = (await response.json()) as Array<{
      lat: string;
      lon: string;
      display_name: string;
    }>;

    if (results.length === 0) {
      console.log(`[geocode] No result for "${query}"`);
      return null;
    }

    const [first] = results;
    const lat = parseFloat(first.lat);
    const lon = parseFloat(first.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      console.error(`[geocode] Invalid coords from Nominatim for "${query}":`, first);
      return null;
    }

    return { latitude: lat, longitude: lon, resolvedAddress: first.display_name };
  } catch (err) {
    console.error(`[geocode] Request failed for "${query}":`, err);
    return null;
  }
}
