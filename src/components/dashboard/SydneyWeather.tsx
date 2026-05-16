/**
 * Sydney 7-day weather strip for the greeting header.
 *
 * Data source: Open-Meteo (https://open-meteo.com) — free, no API key,
 * no rate limit on reasonable use. Their FAQ explicitly permits one site
 * serving its own users without auth.
 *
 * Caching: `next: { revalidate: 1800 }` — 30-min cache so we don't hammer
 * the upstream and so all viewers see the same forecast.
 *
 * Failure mode: graceful no-render. Weather isn't critical; a 5xx from
 * Open-Meteo shouldn't break the dashboard.
 *
 * Doctrine note: no emojis. Tiny inline SVGs for each WMO weather code
 * group — same idea as Material weather icons but stripped to single
 * paths for crisp 14px rendering. Sky's tone uses PALETTE.muted so the
 * weather chrome blends with the rest of the chrome.
 */

import { PALETTE } from '@/lib/utils/constants';

const SYDNEY_LAT = -33.8688;   // HARDCODED-OK: Sydney CBD is the agency's office
const SYDNEY_LNG = 151.2093;   // HARDCODED-OK: same

type DailyForecast = {
  date: string;            // YYYY-MM-DD
  weatherCode: number;     // WMO code
  tempMax: number;         // °C
  tempMin: number;
  precipProbMax: number;   // 0-100
};

type OpenMeteoResponse = {
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
  };
};

async function fetchSydneyForecast(): Promise<DailyForecast[] | null> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(SYDNEY_LAT));
  url.searchParams.set('longitude', String(SYDNEY_LNG));
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max');
  url.searchParams.set('timezone', 'Australia/Sydney');
  url.searchParams.set('forecast_days', '7');

  try {
    const res = await fetch(url.toString(), {
      next: { revalidate: 1800 }, // 30 min — fresh enough for a daily forecast
    });
    if (!res.ok) return null;
    const data = (await res.json()) as OpenMeteoResponse;
    if (!data.daily?.time) return null;
    return data.daily.time.map((date, i) => ({
      date,
      weatherCode: data.daily!.weather_code[i] ?? 0,
      tempMax: Math.round(data.daily!.temperature_2m_max[i] ?? 0),
      tempMin: Math.round(data.daily!.temperature_2m_min[i] ?? 0),
      precipProbMax: data.daily!.precipitation_probability_max[i] ?? 0,
    }));
  } catch {
    return null;
  }
}

/**
 * WMO weather code → category. Five buckets cover everything Sydney
 * actually sees. Sleet / snow / freezing-rain codes collapse into the
 * rain bucket since they're vanishingly rare here.
 */
type WeatherCategory = 'clear' | 'partly_cloudy' | 'cloudy' | 'rain' | 'storm';

function categoriseWmo(code: number): WeatherCategory {
  if (code === 0) return 'clear';
  if (code === 1 || code === 2) return 'partly_cloudy';
  if (code === 3 || code === 45 || code === 48) return 'cloudy';
  if (code >= 95 && code <= 99) return 'storm';
  return 'rain'; // 51-67 drizzle/rain, 71-77 snow (rare), 80-86 showers
}

const CATEGORY_LABEL: Record<WeatherCategory, string> = {
  clear:        'Clear',
  partly_cloudy:'Partly cloudy',
  cloudy:       'Cloudy',
  rain:         'Rain',
  storm:        'Storm',
};

function WeatherIcon({ category, size = 14 }: { category: WeatherCategory; size?: number }) {
  // Inline minimalist SVGs. currentColor is set by the parent via style.color.
  switch (category) {
    case 'clear':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      );
    case 'partly_cloudy':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="7" cy="9" r="3" />
          <path d="M14 15a4 4 0 0 0 0-8 5 5 0 0 0-9 1" />
        </svg>
      );
    case 'cloudy':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
        </svg>
      );
    case 'rain':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 13v8M8 13v8M12 15v8M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" />
        </svg>
      );
    case 'storm':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" />
          <polyline points="13 11 9 17 14 17 11 22" />
        </svg>
      );
  }
}

function dayLabel(iso: string, idx: number): string {
  if (idx === 0) return 'Today';
  if (idx === 1) return 'Tomorrow';
  // YYYY-MM-DD → short weekday, e.g. "Sun"
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', { weekday: 'short' });
  } catch {
    return iso.slice(5); // MM-DD fallback
  }
}

export default async function SydneyWeather() {
  const forecast = await fetchSydneyForecast();
  if (!forecast || forecast.length === 0) return null;

  return (
    <div
      // grid-cols-7 forces every day to occupy the same column width.
      // No per-cell border — Jasper's feedback was that the box outlines
      // felt heavy. Cells now read as columns; if visual separation ever
      // becomes a problem we can add a subtle vertical divider.
      // minWidth keeps the strip from collapsing when wrapped on narrow
      // viewports — ~38px per column × 7 + gaps ≈ 280px.
      className="grid grid-cols-7 gap-x-1"
      style={{ minWidth: 280 }}
      role="region"
      aria-label="Sydney 7-day weather forecast"
    >
      {forecast.map((day, idx) => {
        const cat = categoriseWmo(day.weatherCode);
        return (
          <div
            key={day.date}
            className="flex flex-col items-center justify-start py-0.5"
            title={`${CATEGORY_LABEL[cat]} · ${day.tempMin}°–${day.tempMax}° · ${day.precipProbMax}% precip`}
          >
            <span className="text-[10px] uppercase tracking-wide" style={{ color: PALETTE.muted }}>
              {dayLabel(day.date, idx)}
            </span>
            <span className="my-1" style={{ color: PALETTE.text }} aria-hidden="true">
              <WeatherIcon category={cat} size={18} />
            </span>
            <span className="text-[12px] font-medium tabular-nums leading-tight" style={{ color: PALETTE.text }}>
              {day.tempMax}°
            </span>
            <span className="text-[10px] tabular-nums leading-tight" style={{ color: PALETTE.muted }}>
              {day.tempMin}°
            </span>
          </div>
        );
      })}
    </div>
  );
}
