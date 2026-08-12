import { describe, expect, it } from 'vitest';
import { parseCron } from '../cron/parse';
import { at, iso, isoAll } from '../testUtils';
import { next, nextN, prev } from './api';
import { isInterval } from './search';

const NY = 'America/New_York';

describe('which rule applies', () => {
    it.each([
        ['*/15 * * * *', true],
        ['* 3 * * *', true],
        ['30 * * * *', true],
        ['30 2 * * *', false],
        ['0 */2 * * *', false],
        ['0 0 1 * *', false],
    ])('%s is an interval: %s', (expression, expected) => {
        expect(isInterval(parseCron(expression))).toBe(expected);
    });
});

describe('a wall-clock time the spring forward deleted', () => {
    const schedule = parseCron('30 2 * * *');
    const before = at('2026-03-07T12:00:00Z');

    it('runs once at the far side of the gap by default', () => {
        expect(iso(next(schedule, before, { tz: NY }))).toBe('2026-03-08T07:00:00.000Z');
    });

    it('is skipped when asked', () => {
        expect(iso(next(schedule, before, { tz: NY, nonexistent: 'skip' }))).toBe(
            '2026-03-09T06:30:00.000Z'
        );
    });

    it('throws when asked', () => {
        expect(() => next(schedule, before, { tz: NY, nonexistent: 'throw' })).toThrow(
            /2026-03-08T02:30:00 does not exist in America\/New_York/
        );
    });

    it('collapses a whole gapful of occurrences into one', () => {
        const everyFive = parseCron('*/5 2 * * *');
        expect(isoAll(nextN(everyFive, before, 2, { tz: NY }))).toEqual([
            '2026-03-08T07:00:00.000Z',
            '2026-03-09T06:00:00.000Z',
        ]);
    });

    it('is reported the same way walking backwards', () => {
        expect(iso(prev(schedule, at('2026-03-08T12:00:00Z'), { tz: NY }))).toBe(
            '2026-03-08T07:00:00.000Z'
        );
        expect(
            iso(prev(schedule, at('2026-03-08T12:00:00Z'), { tz: NY, nonexistent: 'skip' }))
        ).toBe('2026-03-07T07:30:00.000Z');
    });

    it('deletes midnight in Santiago, and runs the daily job right after', () => {
        expect(
            iso(
                next(parseCron('0 0 * * *'), at('2026-09-05T12:00:00Z'), {
                    tz: 'America/Santiago',
                })
            )
        ).toBe('2026-09-06T04:00:00.000Z');
    });
});

describe('a wall-clock time the fall back duplicated', () => {
    const schedule = parseCron('30 1 * * *');
    const midnight = at('2026-11-01T04:00:00Z');

    it('runs on the first pass by default, and not on the second', () => {
        const first = next(schedule, midnight, { tz: NY });
        expect(iso(first)).toBe('2026-11-01T05:30:00.000Z');
        expect(iso(next(schedule, first as number, { tz: NY }))).toBe('2026-11-02T06:30:00.000Z');
    });

    it('runs on the second pass when asked', () => {
        const only = next(schedule, midnight, { tz: NY, ambiguous: 'second' });
        expect(iso(only)).toBe('2026-11-01T06:30:00.000Z');
        expect(iso(next(schedule, only as number, { tz: NY, ambiguous: 'second' }))).toBe(
            '2026-11-02T06:30:00.000Z'
        );
    });

    it('runs on both passes when asked', () => {
        expect(isoAll(nextN(schedule, midnight, 3, { tz: NY, ambiguous: 'both' }))).toEqual([
            '2026-11-01T05:30:00.000Z',
            '2026-11-01T06:30:00.000Z',
            '2026-11-02T06:30:00.000Z',
        ]);
    });

    it('picks the same pass walking backwards', () => {
        expect(iso(prev(schedule, at('2026-11-02T00:00:00Z'), { tz: NY }))).toBe(
            '2026-11-01T05:30:00.000Z'
        );
        expect(
            iso(prev(schedule, at('2026-11-02T00:00:00Z'), { tz: NY, ambiguous: 'second' }))
        ).toBe('2026-11-01T06:30:00.000Z');
    });

    it('duplicates only the half hour Lord Howe actually repeats', () => {
        expect(
            iso(
                next(parseCron('45 1 * * *'), at('2026-04-04T00:00:00Z'), {
                    tz: 'Australia/Lord_Howe',
                    ambiguous: 'both',
                })
            )
        ).toBe('2026-04-04T14:45:00.000Z');
        expect(
            isoAll(
                nextN(parseCron('45 1 * * *'), at('2026-04-04T00:00:00Z'), 2, {
                    tz: 'Australia/Lord_Howe',
                    ambiguous: 'both',
                })
            )
        ).toEqual(['2026-04-04T14:45:00.000Z', '2026-04-04T15:15:00.000Z']);
    });

    it('runs once at 02:00 in Warsaw, on the pass that is asked for', () => {
        const schedule = parseCron('0 2 * * *');
        const before = at('2026-10-24T12:00:00Z');
        expect(iso(next(schedule, before, { tz: 'Europe/Warsaw' }))).toBe(
            '2026-10-25T00:00:00.000Z'
        );
        expect(iso(next(schedule, before, { tz: 'Europe/Warsaw', ambiguous: 'second' }))).toBe(
            '2026-10-25T01:00:00.000Z'
        );
    });
});

describe('intervals keep absolute time across a transition', () => {
    it('neither repeats nor skips on the way back', () => {
        const instants = nextN(parseCron('*/15 * * * *'), at('2026-11-01T05:15:00Z'), 7, {
            tz: NY,
        });
        expect(isoAll(instants)).toEqual([
            '2026-11-01T05:30:00.000Z',
            '2026-11-01T05:45:00.000Z',
            '2026-11-01T06:00:00.000Z',
            '2026-11-01T06:15:00.000Z',
            '2026-11-01T06:30:00.000Z',
            '2026-11-01T06:45:00.000Z',
            '2026-11-01T07:00:00.000Z',
        ]);
    });

    it('neither repeats nor skips on the way forward', () => {
        expect(iso(next(parseCron('*/15 * * * *'), at('2026-03-08T06:45:00Z'), { tz: NY }))).toBe(
            '2026-03-08T07:00:00.000Z'
        );
    });

    it('holds for a whole day of every-minute firings', () => {
        const from = at('2026-11-01T04:00:00Z');
        const to = at('2026-11-02T05:00:00Z');
        const instants = nextN(parseCron('* * * * *'), from, 2000, { tz: NY });
        const inDay = instants.filter(instant => instant <= to);
        expect(inDay).toHaveLength(1500);
        for (let i = 1; i < inDay.length; i += 1) {
            expect((inDay[i] as number) - (inDay[i - 1] as number)).toBe(60_000);
        }
    });
});
