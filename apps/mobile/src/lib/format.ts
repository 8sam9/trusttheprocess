/** Number formatting for the presentation layer: en-US thousands separators and a real minus sign. */
export const formatInt = (n: number): string => Math.round(n).toLocaleString('en-US');

/** "−550", "+275" or "0". */
export function formatSigned(n: number): string {
  const r = Math.round(n);
  if (r === 0) return '0';
  return `${r < 0 ? '−' : '+'}${Math.abs(r).toLocaleString('en-US')}`;
}

/** Same value for screen readers: "minus 550", "plus 275", "0". */
export function spokenSigned(n: number): string {
  const r = Math.round(n);
  if (r === 0) return '0';
  return `${r < 0 ? 'minus' : 'plus'} ${Math.abs(r).toLocaleString('en-US')}`;
}

/** "LOSE FAT" -> "Lose fat". Used to build spoken labels from the caps card titles. */
export function sentenceCase(s: string): string {
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseYmd(ymd: string): { y: number; m: number; d: number; weekday: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  return { y, m, d, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** "2026-10-19" -> "19 Oct 2026". The calendar date is formatted as written; no time zone is involved. */
export function formatDayMonthYear(ymd: string): string {
  const p = parseYmd(ymd);
  return p ? `${p.d} ${MONTHS[p.m - 1] ?? ''} ${p.y}` : ymd;
}

/** "2026-10-19" -> "Mon 19 Oct". */
export function formatWeekdayDay(ymd: string): string {
  const p = parseYmd(ymd);
  return p ? `${WEEKDAYS[p.weekday] ?? ''} ${p.d} ${MONTHS[p.m - 1] ?? ''}` : ymd;
}
