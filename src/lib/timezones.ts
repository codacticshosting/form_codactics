// A curated list of common named timezones with fixed UTC offsets (not a
// full IANA database) — Standard and Daylight variants are listed as
// separate, explicit entries so the admin picks the exact offset they
// mean, rather than relying on automatic DST-transition rules.
export interface TimezoneOption {
  id: string;
  label: string;
  offsetMinutes: number; // zone time = UTC + offsetMinutes
}

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { id: "UTC", label: "UTC (UTC+00:00)", offsetMinutes: 0 },
  { id: "GMT", label: "GMT — Greenwich Mean Time (UTC+00:00)", offsetMinutes: 0 },
  { id: "PST", label: "PST — Pacific Standard Time (UTC-08:00)", offsetMinutes: -480 },
  { id: "PDT", label: "PDT — Pacific Daylight Time (UTC-07:00)", offsetMinutes: -420 },
  { id: "MST", label: "MST — Mountain Standard Time (UTC-07:00)", offsetMinutes: -420 },
  { id: "MDT", label: "MDT — Mountain Daylight Time (UTC-06:00)", offsetMinutes: -360 },
  { id: "CST", label: "CST — Central Standard Time (UTC-06:00)", offsetMinutes: -360 },
  { id: "CDT", label: "CDT — Central Daylight Time (UTC-05:00)", offsetMinutes: -300 },
  { id: "EST", label: "EST — Eastern Standard Time (UTC-05:00)", offsetMinutes: -300 },
  { id: "EDT", label: "EDT — Eastern Daylight Time (UTC-04:00)", offsetMinutes: -240 },
  { id: "AST", label: "AST — Atlantic Standard Time (UTC-04:00)", offsetMinutes: -240 },
  { id: "BRT", label: "BRT — Brasília Time (UTC-03:00)", offsetMinutes: -180 },
  { id: "AKST", label: "AKST — Alaska Standard Time (UTC-09:00)", offsetMinutes: -540 },
  { id: "HST", label: "HST — Hawaii Standard Time (UTC-10:00)", offsetMinutes: -600 },
  { id: "WAT", label: "WAT — West Africa Time (UTC+01:00)", offsetMinutes: 60 },
  { id: "CET", label: "CET — Central European Time (UTC+01:00)", offsetMinutes: 60 },
  { id: "CEST", label: "CEST — Central European Summer Time (UTC+02:00)", offsetMinutes: 120 },
  { id: "EET", label: "EET — Eastern European Time (UTC+02:00)", offsetMinutes: 120 },
  { id: "EEST", label: "EEST — Eastern European Summer Time (UTC+03:00)", offsetMinutes: 180 },
  { id: "SAST", label: "SAST — South Africa Standard Time (UTC+02:00)", offsetMinutes: 120 },
  { id: "MSK", label: "MSK — Moscow Time (UTC+03:00)", offsetMinutes: 180 },
  { id: "GST", label: "GST — Gulf Standard Time (UTC+04:00)", offsetMinutes: 240 },
  { id: "IST", label: "IST — India Standard Time (UTC+05:30)", offsetMinutes: 330 },
  { id: "ICT", label: "ICT — Indochina Time (UTC+07:00)", offsetMinutes: 420 },
  { id: "SGT", label: "SGT — Singapore Time (UTC+08:00)", offsetMinutes: 480 },
  { id: "CTT", label: "CTT — China Standard Time (UTC+08:00)", offsetMinutes: 480 },
  { id: "JST", label: "JST — Japan Standard Time (UTC+09:00)", offsetMinutes: 540 },
  { id: "AEST", label: "AEST — Australian Eastern Standard Time (UTC+10:00)", offsetMinutes: 600 },
  { id: "AEDT", label: "AEDT — Australian Eastern Daylight Time (UTC+11:00)", offsetMinutes: 660 },
  { id: "NZST", label: "NZST — New Zealand Standard Time (UTC+12:00)", offsetMinutes: 720 },
];

export function getTimezoneOffset(id: string): number {
  return TIMEZONE_OPTIONS.find((tz) => tz.id === id)?.offsetMinutes ?? 0;
}

// Converts wall-clock date/time components as understood in the given
// timezone into the absolute UTC instant they represent — computed once at
// save time so every later comparison is plain "now > closesAt", with no
// timezone math (or DST ambiguity) needed anywhere else.
export function localToUtcInstant(
  dateStr: string, // "YYYY-MM-DD"
  timeStr: string, // "HH:MM"
  offsetMinutes: number,
): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeStr);
  if (!dateMatch || !timeMatch) return null;
  const [, y, m, d] = dateMatch;
  const [, hh, mm] = timeMatch;
  const naiveUtcMillis = Date.UTC(
    Number(y),
    Number(m) - 1,
    Number(d),
    Number(hh),
    Number(mm),
  );
  return new Date(naiveUtcMillis - offsetMinutes * 60000);
}

// Inverse of localToUtcInstant — for redisplaying a stored deadline back
// as the date/time fields the admin originally picked.
export function utcInstantToLocal(
  date: Date,
  offsetMinutes: number,
): { dateStr: string; timeStr: string } {
  const localMillis = date.getTime() + offsetMinutes * 60000;
  const local = new Date(localMillis);
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
  const timeStr = `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
  return { dateStr, timeStr };
}

// Unlike the fixed-offset list above, submission timestamps are shown in
// real German local time — the JS runtime's own IANA tz database already
// knows exactly when CET/CEST switch over, so there's no need to hand-roll
// DST rules the way the fixed-offset picker deliberately avoids.
const BERLIN_TZ = "Europe/Berlin";

// Built once and reused — a formatter's own options never change between
// calls, so there's no reason to reconstruct one per date (export routes
// and the Responses page each format one of these per submission row).
const berlinDateFormatter = new Intl.DateTimeFormat("en-CA", {
  // en-CA gives YYYY-MM-DD ordering — unambiguous, unlike DD/MM vs MM/DD.
  timeZone: BERLIN_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const berlinTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: BERLIN_TZ,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function formatBerlinDate(date: Date): string {
  return berlinDateFormatter.format(date);
}

export function formatBerlinTime(date: Date): string {
  return berlinTimeFormatter.format(date);
}
