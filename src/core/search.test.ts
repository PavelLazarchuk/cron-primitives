import { describe, expect, it } from 'vitest';
import { parseCron } from '../cron/parse';
import { at, iso, isoAll, oracleWall } from '../testUtils';
import { matches, next, nextN, occurrences, prev } from './api';
import { isReboot } from './search';

const T0 = at('2026-01-01T00:00:00Z');

describe('next', () => {
    it('is strictly after its argument', () => {
        const schedule = parseCron('0 9 * * *');
        const first = next(schedule, T0);
        expect(iso(first)).toBe('2026-01-01T09:00:00.000Z');
        expect(iso(next(schedule, first as number))).toBe('2026-01-02T09:00:00.000Z');
    });

    it('ignores a sub-second remainder in the argument', () => {
        const schedule = parseCron('0 9 * * *');
        expect(next(schedule, at('2026-01-01T09:00:00Z') - 1)).toBe(at('2026-01-01T09:00:00Z'));
        expect(next(schedule, at('2026-01-01T09:00:00Z') + 1)).toBe(at('2026-01-02T09:00:00Z'));
    });

    it('walks minutes, hours, days, months and years', () => {
        expect(iso(next(parseCron('*/15 * * * *'), at('2026-01-01T09:07:00Z')))).toBe(
            '2026-01-01T09:15:00.000Z'
        );
        expect(iso(next(parseCron('0 0 1 * *'), at('2026-01-31T23:59:59Z')))).toBe(
            '2026-02-01T00:00:00.000Z'
        );
        expect(iso(next(parseCron('0 0 1 1 *'), at('2026-06-01T00:00:00Z')))).toBe(
            '2027-01-01T00:00:00.000Z'
        );
    });

    it('walks seconds when the expression has them', () => {
        expect(iso(next(parseCron('*/20 * * * * *'), at('2026-01-01T00:00:05Z')))).toBe(
            '2026-01-01T00:00:20.000Z'
        );
    });

    it('crosses a leap day', () => {
        expect(iso(next(parseCron('0 12 29 2 *'), at('2026-01-01T00:00:00Z')))).toBe(
            '2028-02-29T12:00:00.000Z'
        );
    });

    it('returns null for a date that never comes, without spinning', () => {
        const started = Date.now();
        expect(next(parseCron('0 0 30 2 *'), T0)).toBeNull();
        expect(Date.now() - started).toBeLessThan(500);
    });

    it('returns null past the horizon, and finds the same instant when allowed further', () => {
        const schedule = parseCron('0 12 29 2 *');
        expect(next(schedule, T0, { maxYears: 1 })).toBeNull();
        expect(iso(next(schedule, T0, { maxYears: 3 }))).toBe('2028-02-29T12:00:00.000Z');
    });

    it('respects the time zone', () => {
        const schedule = parseCron('0 9 * * *');
        expect(iso(next(schedule, T0, { tz: 'Europe/Warsaw' }))).toBe('2026-01-01T08:00:00.000Z');
        expect(iso(next(schedule, T0, { tz: 'Asia/Kathmandu' }))).toBe('2026-01-01T03:15:00.000Z');
    });
});

describe('day fields', () => {
    it('matches either day field when both are restricted, as crontab does', () => {
        const schedule = parseCron('0 0 13 * 5');
        expect(isoAll(nextN(schedule, at('2026-02-01T00:00:00Z'), 3))).toEqual([
            '2026-02-06T00:00:00.000Z',
            '2026-02-13T00:00:00.000Z',
            '2026-02-20T00:00:00.000Z',
        ]);
    });

    it('intersects them when asked to', () => {
        const schedule = parseCron('0 0 13 * 5', { domDowMode: 'and' });
        expect(isoAll(nextN(schedule, at('2026-02-01T00:00:00Z'), 2))).toEqual([
            '2026-02-13T00:00:00.000Z',
            '2026-03-13T00:00:00.000Z',
        ]);
    });

    it('resolves L, L-n and LW', () => {
        expect(isoAll(nextN(parseCron('0 0 L * *'), T0, 2))).toEqual([
            '2026-01-31T00:00:00.000Z',
            '2026-02-28T00:00:00.000Z',
        ]);
        expect(iso(next(parseCron('0 0 L-2 * *'), T0))).toBe('2026-01-29T00:00:00.000Z');
        expect(iso(next(parseCron('0 0 LW 5 *'), T0))).toBe('2026-05-29T00:00:00.000Z');
    });

    it('resolves W to the nearest weekday inside the same month', () => {
        expect(iso(next(parseCron('0 0 15W 8 *'), T0))).toBe('2026-08-14T00:00:00.000Z');
        expect(iso(next(parseCron('0 0 1W 2 *'), T0))).toBe('2026-02-02T00:00:00.000Z');
    });

    it('resolves nth and last weekday', () => {
        expect(iso(next(parseCron('0 0 * * 1#3'), T0))).toBe('2026-01-19T00:00:00.000Z');
        expect(iso(next(parseCron('0 0 * * 5L'), T0))).toBe('2026-01-30T00:00:00.000Z');
    });
});

describe('prev', () => {
    it('is strictly before its argument, and inverts next', () => {
        const schedule = parseCron('0 9 * * 1-5');
        const instant = at('2026-03-10T09:00:00Z');
        expect(iso(prev(schedule, instant))).toBe('2026-03-09T09:00:00.000Z');
        expect(next(schedule, prev(schedule, instant) as number)).toBe(instant);
    });

    it('walks backwards over months, years and modifiers', () => {
        expect(iso(prev(parseCron('0 0 1 1 *'), at('2026-06-01T00:00:00Z')))).toBe(
            '2026-01-01T00:00:00.000Z'
        );
        expect(iso(prev(parseCron('0 0 L * *'), at('2026-03-15T00:00:00Z')))).toBe(
            '2026-02-28T00:00:00.000Z'
        );
        expect(iso(prev(parseCron('0 12 29 2 *'), at('2026-01-01T00:00:00Z')))).toBe(
            '2024-02-29T12:00:00.000Z'
        );
    });

    it('returns null past the horizon', () => {
        expect(prev(parseCron('0 0 30 2 *'), T0)).toBeNull();
    });
});

describe('nextN and occurrences', () => {
    it('returns ascending, strictly increasing instants', () => {
        const instants = nextN(parseCron('*/17 * * * *'), T0, 20);
        expect(instants).toHaveLength(20);
        for (let i = 1; i < instants.length; i += 1) {
            expect(instants[i] as number).toBeGreaterThan(instants[i - 1] as number);
        }
    });

    it('comes back short rather than looping when the horizon runs out', () => {
        expect(isoAll(nextN(parseCron('0 12 29 2 *'), T0, 5, { maxYears: 3 }))).toEqual([
            '2028-02-29T12:00:00.000Z',
        ]);
        expect(nextN(parseCron('0 9 * * *'), T0, 0)).toEqual([]);
        expect(() => nextN(parseCron('0 9 * * *'), T0, -1)).toThrow(/non-negative integer/);
    });

    it('yields the half-open range (from, to]', () => {
        const schedule = parseCron('0 * * * *');
        const from = at('2026-01-01T00:00:00Z');
        const to = at('2026-01-01T03:00:00Z');
        expect(isoAll([...occurrences(schedule, { from, to })])).toEqual([
            '2026-01-01T01:00:00.000Z',
            '2026-01-01T02:00:00.000Z',
            '2026-01-01T03:00:00.000Z',
        ]);
    });
});

describe('matches', () => {
    it('agrees with next at every instant next returns', () => {
        const schedule = parseCron('30 9 * * 1-5');
        for (const instant of nextN(schedule, T0, 25)) {
            expect(matches(schedule, instant)).toBe(true);
            expect(matches(schedule, instant + 60_000)).toBe(false);
        }
    });

    it('truncates to the second', () => {
        const schedule = parseCron('0 9 * * *');
        expect(matches(schedule, at('2026-01-01T09:00:00Z') + 500)).toBe(true);
    });
});

function bruteForce(expression: string, tz: string, from: number, to: number): number[] {
    const schedule = parseCron(expression);
    const found: number[] = [];
    for (let instant = from; instant <= to; instant += 60_000) {
        const wall = oracleWall(tz, instant);
        if (
            schedule.minute.includes(wall.minute) &&
            schedule.hour.includes(wall.hour) &&
            schedule.month.includes(wall.month) &&
            schedule.dom.days.includes(wall.day) &&
            schedule.dow.days.includes(wall.weekday)
        ) {
            found.push(instant);
        }
    }
    return found;
}

describe('agreement with a brute-force scan', () => {
    const corpus = [
        '*/7 * * * *',
        '0 */3 * * *',
        '30 9 * * 1-5',
        '0 0 1,15 * *',
        '*/5 9-17 * * *',
        '15 3 * * 6',
        '23 0-6/2 * * *',
    ];

    const windows: Array<[string, string, string]> = [
        ['UTC', '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z'],
        ['America/New_York', '2026-03-07T00:00:00Z', '2026-03-10T00:00:00Z'],
        ['America/New_York', '2026-10-31T00:00:00Z', '2026-11-03T00:00:00Z'],
        ['Australia/Lord_Howe', '2026-10-03T00:00:00Z', '2026-10-05T00:00:00Z'],
        ['Pacific/Chatham', '2026-04-04T00:00:00Z', '2026-04-06T00:00:00Z'],
        ['America/Santiago', '2026-09-05T00:00:00Z', '2026-09-07T00:00:00Z'],
    ];

    for (const [tz, fromIso, toIso] of windows) {
        for (const expression of corpus) {
            it(`${expression} in ${tz} from ${fromIso}`, () => {
                const from = at(fromIso);
                const to = at(toIso);
                const expected = bruteForce(expression, tz, from, to);
                const actual = [
                    ...occurrences(
                        parseCron(expression),
                        { from: from - 1, to },
                        {
                            tz,
                            ambiguous: 'both',
                            nonexistent: 'skip',
                        }
                    ),
                ];
                expect(isoAll(actual)).toEqual(isoAll(expected));
            });
        }
    }
});

describe('walking backwards agrees with walking forwards', () => {
    it.each([
        ['*/7 * * * *', 'UTC'],
        ['30 9 * * 1-5', 'America/New_York'],
        ['0 0 1,15 * *', 'Europe/Warsaw'],
        ['0 2 * * *', 'America/New_York'],
        ['*/15 * * * *', 'America/New_York'],
    ])('%s in %s', (expression, tz) => {
        const schedule = parseCron(expression);
        const forward = nextN(schedule, at('2026-03-01T00:00:00Z'), 400, { tz });
        expect(forward.length).toBeGreaterThan(0);

        const backward: number[] = [];
        let cursor = (forward[forward.length - 1] as number) + 1;
        for (let i = 0; i < forward.length; i += 1) {
            const instant = prev(schedule, cursor, { tz });
            if (instant === null) break;
            backward.push(instant);
            cursor = instant;
        }
        expect(isoAll(backward.reverse())).toEqual(isoAll(forward));
    });
});

describe('the year field', () => {
    it('fires only in the years it names', () => {
        const schedule = parseCron('0 0 1 1 ? 2028,2030', { seconds: false });
        expect(nextN(schedule, at('2026-01-01T00:00:00Z'), 3, { maxYears: 20 })).toEqual([
            at('2028-01-01T00:00:00Z'),
            at('2030-01-01T00:00:00Z'),
        ]);
    });

    it('runs out rather than spinning past the last year', () => {
        const schedule = parseCron('0 0 1 1 ? 2027', { seconds: false });
        expect(next(schedule, at('2028-01-01T00:00:00Z'), { maxYears: 50 })).toBeNull();
        expect(prev(schedule, at('2026-01-01T00:00:00Z'), { maxYears: 50 })).toBeNull();
    });

    it('walks backwards into the newest year it names', () => {
        const schedule = parseCron('0 0 31 12 ? 2027,2030', { seconds: false });
        expect(prev(schedule, at('2033-06-01T00:00:00Z'), { maxYears: 20 })).toEqual(
            at('2030-12-31T00:00:00Z')
        );
    });

    it('is honoured by matches', () => {
        const schedule = parseCron('0 0 1 1 ? 2028', { seconds: false });
        expect(matches(schedule, at('2028-01-01T00:00:00Z'))).toBe(true);
        expect(matches(schedule, at('2029-01-01T00:00:00Z'))).toBe(false);
    });
});

describe('@reboot', () => {
    const schedule = parseCron('@reboot');

    it('has no next, no previous and no match', () => {
        expect(isReboot(schedule)).toBe(true);
        expect(next(schedule, 0)).toBeNull();
        expect(prev(schedule, 0)).toBeNull();
        expect(matches(schedule, 0)).toBe(false);
    });

    it('is not a reboot for every other schedule', () => {
        expect(isReboot(parseCron('@daily'))).toBe(false);
    });
});
