// Daily-draft history: turns the stored per-day records into totals and win streaks.
// Pure logic, no DOM and no storage access; the UI loads the records and passes them in.
//
// records: { 'YYYY-MM-DD': record } with UTC dates (same format as todayString() in draft.js).
//   { won: true|false, turns: n }  a finished daily battle
//   { started: true }              a daily battle that was started but never finished (a loss)
// Anything else (bad keys, null, other shapes) is ignored.

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

// Day number since the epoch for a 'YYYY-MM-DD' string, or null if it is not a real date.
function dayNumber(s) {
  if (typeof s !== 'string') return null;
  const m = DATE_KEY.exec(s);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  // Reject dates that roll over, such as 2026-02-30.
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return Math.round(ms / DAY_MS);
}

// True for a real calendar date written as 'YYYY-MM-DD'.
export function isDateKey(s) {
  return dayNumber(s) !== null;
}

// True for a record the summary counts: a finished battle or an unfinished attempt.
export function isValidRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  return typeof value.won === 'boolean' || value.started === true;
}

// Returns { played, wins, currentStreak, bestStreak } for the records up to and including today.
// A streak is a run of consecutive days, each won. currentStreak is the run ending today, or
// ending yesterday when today has no record yet. Throws if today is not a 'YYYY-MM-DD' date.
export function summarize(records, today) {
  const todayNum = dayNumber(today);
  if (todayNum === null) throw new TypeError(`summarize: today must be a 'YYYY-MM-DD' date, got ${today}`);

  // day number -> won (unfinished attempts count as lost)
  const days = new Map();
  if (records && typeof records === 'object') {
    for (const [key, value] of Object.entries(records)) {
      const n = dayNumber(key);
      if (n === null || n > todayNum || !isValidRecord(value)) continue;
      days.set(n, value.won === true);
    }
  }

  let wins = 0;
  let bestStreak = 0;
  let run = 0;
  let prev = null;
  for (const n of [...days.keys()].sort((a, b) => a - b)) {
    const won = days.get(n);
    if (won) {
      wins++;
      run = prev !== null && n === prev + 1 && run > 0 ? run + 1 : 1;
      bestStreak = Math.max(bestStreak, run);
    } else {
      run = 0;
    }
    prev = n;
  }

  let currentStreak = 0;
  let day = days.has(todayNum) ? todayNum : todayNum - 1;
  while (days.get(day) === true) {
    currentStreak++;
    day--;
  }

  return { played: days.size, wins, currentStreak, bestStreak };
}
