import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, isDateKey, isValidRecord } from '../public/js/stats.js';

const W = { won: true, turns: 12 };
const L = { won: false, turns: 9 };
const U = { started: true };

const ZERO = { played: 0, wins: 0, currentStreak: 0, bestStreak: 0 };

test('empty, null and undefined records give all zeros', () => {
  assert.deepEqual(summarize({}, '2026-11-18'), ZERO);
  assert.deepEqual(summarize(null, '2026-11-18'), ZERO);
  assert.deepEqual(summarize(undefined, '2026-11-18'), ZERO);
});

test('consecutive wins ending today count as one streak', () => {
  const records = { '2026-11-16': W, '2026-11-17': W, '2026-11-18': W };
  assert.deepEqual(summarize(records, '2026-11-18'), { played: 3, wins: 3, currentStreak: 3, bestStreak: 3 });
});

test('a loss resets the streak', () => {
  const records = { '2026-11-15': W, '2026-11-16': L, '2026-11-17': W, '2026-11-18': W };
  assert.deepEqual(summarize(records, '2026-11-18'), { played: 4, wins: 3, currentStreak: 2, bestStreak: 2 });
});

test('a missed day breaks the streak', () => {
  const records = { '2026-11-14': W, '2026-11-15': W, '2026-11-17': W, '2026-11-18': W };
  // 14, 15 | gap on 16 | 17, 18
  assert.deepEqual(summarize(records, '2026-11-18'), { played: 4, wins: 4, currentStreak: 2, bestStreak: 2 });
});

test('an unfinished attempt counts as played and as a loss', () => {
  const records = { '2026-11-16': W, '2026-11-17': U, '2026-11-18': W };
  assert.deepEqual(summarize(records, '2026-11-18'), { played: 3, wins: 2, currentStreak: 1, bestStreak: 1 });
  assert.deepEqual(summarize({ '2026-11-18': U }, '2026-11-18'), { played: 1, wins: 0, currentStreak: 0, bestStreak: 0 });
});

test('best streak can be longer than the current one', () => {
  const records = {
    '2026-11-01': W, '2026-11-02': W, '2026-11-03': W, '2026-11-04': W,
    '2026-11-05': L,
    '2026-11-17': W, '2026-11-18': W,
  };
  assert.deepEqual(summarize(records, '2026-11-18'), { played: 7, wins: 6, currentStreak: 2, bestStreak: 4 });
});

test('with no record today, the current streak is the one ending yesterday', () => {
  const records = { '2026-11-15': W, '2026-11-16': W, '2026-11-17': W };
  assert.deepEqual(summarize(records, '2026-11-18'), { played: 3, wins: 3, currentStreak: 3, bestStreak: 3 });
  // Two days ago is too old: the streak has lapsed.
  assert.equal(summarize(records, '2026-11-19').currentStreak, 0);
  assert.equal(summarize(records, '2026-11-19').bestStreak, 3);
});

test('losing today makes the current streak 0', () => {
  const records = { '2026-11-16': W, '2026-11-17': W, '2026-11-18': L };
  assert.deepEqual(summarize(records, '2026-11-18'), { played: 3, wins: 2, currentStreak: 0, bestStreak: 2 });
});

test('streaks run across month boundaries, including February and leap years', () => {
  const records = { '2026-10-30': W, '2026-10-31': W, '2026-11-01': W };
  assert.equal(summarize(records, '2026-11-01').currentStreak, 3);
  const feb = { '2027-02-27': W, '2027-02-28': W, '2027-03-01': W };
  assert.equal(summarize(feb, '2027-03-01').currentStreak, 3);
  const leap = { '2028-02-28': W, '2028-02-29': W, '2028-03-01': W };
  assert.equal(summarize(leap, '2028-03-01').currentStreak, 3);
  // In a non-leap year, 02-28 -> 03-01 is consecutive; 02-29 does not exist.
  assert.equal(summarize({ '2027-02-28': W, '2027-03-01': W }, '2027-03-01').bestStreak, 2);
});

test('streaks run across year boundaries and DST changes', () => {
  const records = { '2026-12-30': W, '2026-12-31': W, '2027-01-01': W, '2027-01-02': W };
  assert.deepEqual(summarize(records, '2027-01-02'), { played: 4, wins: 4, currentStreak: 4, bestStreak: 4 });
  // Around the March and November clock changes in many time zones.
  const dst = { '2026-03-07': W, '2026-03-08': W, '2026-03-09': W, '2026-10-31': W, '2026-11-01': W, '2026-11-02': W };
  assert.equal(summarize(dst, '2026-11-02').bestStreak, 3);
  assert.equal(summarize(dst, '2026-11-02').currentStreak, 3);
});

test('records dated after today are ignored', () => {
  const records = { '2026-11-17': W, '2026-11-18': W, '2026-11-19': W, '2027-01-01': L };
  assert.deepEqual(summarize(records, '2026-11-18'), { played: 2, wins: 2, currentStreak: 2, bestStreak: 2 });
});

test('malformed keys and values are ignored', () => {
  const records = {
    '2026-11-17': W,
    '2026-11-18': W,
    'settings': W,
    '2026-11-1': W,
    '2026-02-30': W,
    '2026-13-01': W,
    '20261116': W,
    '2026-11-10': null,
    '2026-11-11': 'won',
    '2026-11-12': 7,
    '2026-11-13': {},
    '2026-11-14': { won: 'yes' },
    '2026-11-15': { started: 'true' },
    '2026-11-16': [true],
  };
  assert.deepEqual(summarize(records, '2026-11-18'), { played: 2, wins: 2, currentStreak: 2, bestStreak: 2 });
});

test('summarize does not change the records it is given', () => {
  const records = { '2026-11-17': W, '2026-11-18': L };
  const copy = structuredClone(records);
  summarize(records, '2026-11-18');
  assert.deepEqual(records, copy);
});

test('summarize rejects a today that is not a date', () => {
  assert.throws(() => summarize({}, '18/11/2026'), TypeError);
  assert.throws(() => summarize({}, undefined), TypeError);
});

test('isDateKey accepts real YYYY-MM-DD dates only', () => {
  assert.equal(isDateKey('2026-11-18'), true);
  assert.equal(isDateKey('2028-02-29'), true);
  assert.equal(isDateKey('2027-02-29'), false);
  assert.equal(isDateKey('2026-11-18T00:00:00Z'), false);
  assert.equal(isDateKey('2026-1-08'), false);
  assert.equal(isDateKey(20261118), false);
  assert.equal(isDateKey(null), false);
});

test('isValidRecord accepts finished battles and unfinished attempts only', () => {
  assert.equal(isValidRecord(W), true);
  assert.equal(isValidRecord(L), true);
  assert.equal(isValidRecord(U), true);
  assert.equal(isValidRecord({ started: false }), false);
  assert.equal(isValidRecord(null), false);
  assert.equal(isValidRecord([]), false);
});
