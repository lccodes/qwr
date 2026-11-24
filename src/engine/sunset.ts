import type { SunsetInfo } from '../types';

/** Quogue Wildlife Refuge coordinates */
const QWR_LAT = 40.8343;
const QWR_LNG = -72.6155;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Pure offline NOAA solar calculation returning UTC sunrise & sunset timestamps
 * for Quogue, NY (works with zero network connectivity).
 */
export function computeQuogueSolarTimes(date: Date): {
  sunriseUtc: Date;
  sunsetUtc: Date;
} {
  // Determine calendar date in America/New_York so evening UTC rollovers don't pick tomorrow
  const nyParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  }).formatToParts(date);

  const year = Number(nyParts.find((p) => p.type === 'year')?.value ?? date.getUTCFullYear());
  const month = Number(nyParts.find((p) => p.type === 'month')?.value ?? date.getUTCMonth() + 1);
  const day = Number(nyParts.find((p) => p.type === 'day')?.value ?? date.getUTCDate());

  const startOfYear = Date.UTC(year, 0, 1);
  const currentDay = Date.UTC(year, month - 1, day);
  const dayOfYear = Math.floor((currentDay - startOfYear) / 86400000) + 1;

  // Fractional year gamma (radians) at solar noon
  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1);

  // Equation of time (minutes)
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));

  // Solar declination angle (radians)
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  // Hour angle for official sunrise/sunset (zenith = 90.833°)
  const latRad = QWR_LAT * DEG_TO_RAD;
  const zenithRad = 90.833 * DEG_TO_RAD;
  const cosHa =
    Math.cos(zenithRad) / (Math.cos(latRad) * Math.cos(decl)) -
    Math.tan(latRad) * Math.tan(decl);
  const haDeg = Math.acos(Math.max(-1, Math.min(1, cosHa))) * RAD_TO_DEG;

  // Sunrise and sunset in UTC minutes from midnight
  const sunriseMinutesUtc = 720 - 4 * (QWR_LNG + haDeg) - eqTime;
  const sunsetMinutesUtc = 720 - 4 * (QWR_LNG - haDeg) - eqTime;

  const sunriseUtc = new Date(currentDay + Math.round(sunriseMinutesUtc * 60000));
  const sunsetUtc = new Date(currentDay + Math.round(sunsetMinutesUtc * 60000));

  return { sunriseUtc, sunsetUtc };
}

function formatNyTime(d: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit'
  }).format(d);
}

/**
 * Returns visitor-friendly Refuge hours status relative to local Quogue sunset.
 */
export function getRefugeSunsetInfo(now: Date = new Date()): SunsetInfo {
  const { sunriseUtc, sunsetUtc } = computeQuogueSolarTimes(now);
  const sunriseText = formatNyTime(sunriseUtc);
  const sunsetText = formatNyTime(sunsetUtc);

  const minutesUntilSunset = Math.round(
    (sunsetUtc.getTime() - now.getTime()) / 60000
  );
  const isBeforeSunrise = now.getTime() < sunriseUtc.getTime();

  if (isBeforeSunrise) {
    return {
      sunriseText,
      sunsetText,
      minutesUntilSunset,
      status: 'after-sunset',
      label: `Opens at sunrise · ${sunriseText}`
    };
  }

  if (minutesUntilSunset <= 0) {
    return {
      sunriseText,
      sunsetText,
      minutesUntilSunset,
      status: 'after-sunset',
      label: `Closed at sunset · ${sunsetText}`
    };
  }

  if (minutesUntilSunset <= 45) {
    return {
      sunriseText,
      sunsetText,
      minutesUntilSunset,
      status: 'closing-soon',
      label: `Sunset in ${minutesUntilSunset}m · ${sunsetText}`
    };
  }

  return {
    sunriseText,
    sunsetText,
    minutesUntilSunset,
    status: 'open',
    label: `Open until sunset · ${sunsetText}`
  };
}
