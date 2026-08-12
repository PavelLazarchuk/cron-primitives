import { describe, expect, it } from 'vitest';
import { CronSyntaxError } from '../core/errors';
import { isInterval } from '../core/search';
import { parseCron, safeParseCron } from './parse';

describe('field expansion', () => {
    it('expands the standard five fields', () => {
        const schedule = parseCron('30 9 * * *');
        expect(schedule.minute).toEqual([30]);
        expect(schedule.hour).toEqual([9]);
        expect(schedule.dom.days).toHaveLength(31);
        expect(schedule.month).toHaveLength(12);
        expect(schedule.dow.days).toHaveLength(7);
        expect(schedule.hasSeconds).toBe(false);
        expect(schedule.second).toEqual([0]);
    });

    it('reads a sixth field as seconds', () => {
        const schedule = parseCron('15 30 9 * * *');
        expect(schedule.second).toEqual([15]);
        expect(schedule.minute).toEqual([30]);
        expect(schedule.hasSeconds).toBe(true);
    });

    it('honours an explicit seconds flag', () => {
        expect(() => parseCron('30 9 * * *', { seconds: true })).toThrow(/expected 6 fields/);
        expect(() => parseCron('15 30 9 * * *', { seconds: false })).toThrow(/expected 5 fields/);
    });

    it('expands steps, ranges and lists', () => {
        expect(parseCron('*/15 * * * *').minute).toEqual([0, 15, 30, 45]);
        expect(parseCron('0-10/3 * * * *').minute).toEqual([0, 3, 6, 9]);
        expect(parseCron('5,10,5 * * * *').minute).toEqual([5, 10]);
        expect(parseCron('50/15 * * * *').minute).toEqual([50]);
        expect(parseCron('0 0 * * 1-5').dow.days).toEqual([1, 2, 3, 4, 5]);
    });

    it('reads month and weekday names, in any case', () => {
        expect(parseCron('0 0 1 JAN,jul *').month).toEqual([1, 7]);
        expect(parseCron('0 0 * * mon-FRI').dow.days).toEqual([1, 2, 3, 4, 5]);
    });

    it('treats both 0 and 7 as Sunday', () => {
        expect(parseCron('0 0 * * 7').dow.days).toEqual([0]);
        expect(parseCron('0 0 * * 5-7').dow.days).toEqual([0, 5, 6]);
        expect(parseCron('0 0 * * 7L').dow.last).toEqual([0]);
        expect(parseCron('0 0 * * 7#2').dow.nth).toEqual([{ day: 0, nth: 2 }]);
    });

    it('reads a weekday range through 7 as reaching Sunday, not starting over at it', () => {
        expect(parseCron('0 0 * * 0-7').dow.days).toEqual([0, 1, 2, 3, 4, 5, 6]);
        expect(parseCron('0 0 * * 1-7').dow.days).toEqual([0, 1, 2, 3, 4, 5, 6]);
        expect(parseCron('0 0 * * 6-7').dow.days).toEqual([0, 6]);
        expect(parseCron('0 0 * * 0-7/2').dow.days).toEqual([0, 2, 4, 6]);
    });

    it('wraps a backwards weekday range and refuses a backwards one elsewhere', () => {
        expect(parseCron('0 0 * * FRI-MON').dow.days).toEqual([0, 1, 5, 6]);
        expect(() => parseCron('0 0 * MAR-JAN *')).toThrow(/runs backwards/);
    });

    it('expands the macros', () => {
        expect(parseCron('@daily')).toEqual(parseCron('0 0 * * *'));
        expect(parseCron('@WEEKLY')).toEqual(parseCron('0 0 * * 0'));
        expect(parseCron('@yearly')).toEqual(parseCron('0 0 1 1 *'));
    });

    it('expands @every into the step it means', () => {
        expect(parseCron('@every 30s')).toEqual(parseCron('*/30 * * * * *'));
        expect(parseCron('@every 5m')).toEqual(parseCron('*/5 * * * *'));
        expect(parseCron('@every 2h')).toEqual(parseCron('0 */2 * * *'));
        expect(parseCron('@every 1d')).toEqual(parseCron('@daily'));
        expect(parseCron('@every 1s').hasSeconds).toBe(true);
        expect(parseCron('@every 1m').hasSeconds).toBe(false);
    });

    it('reads the @every unit long or short, in any case', () => {
        for (const expression of [
            '@every 5m',
            '@every 5 m',
            '@every 5min',
            '@every 5 mins',
            '@every 5 minute',
            '@EVERY 5 Minutes',
        ]) {
            expect(parseCron(expression)).toEqual(parseCron('*/5 * * * *'));
        }
    });

    it('leaves an @every interval reading as one', () => {
        expect(isInterval(parseCron('@every 5m'))).toBe(true);
        expect(isInterval(parseCron('@every 30s'))).toBe(true);
        expect(isInterval(parseCron('@every 2h'))).toBe(false);
    });

    it.each([
        ['@every 7m', /does not divide the hour evenly/],
        ['@every 90s', /does not divide the minute evenly/],
        ['@every 5h', /does not divide the day evenly/],
        ['@every 3d', /the day-of-month field restarts every month/],
        ['@every 0m', /count of at least 1/],
        ['@every', /@every takes a count and a unit/],
        ['@every 5', /@every takes a count and a unit/],
        ['@every 5 weeks', /@every takes a count and a unit/],
        ['@everything', /unknown macro/],
    ])('refuses the @every periods cron cannot hold: %s', (expression, message) => {
        expect(() => parseCron(expression)).toThrow(message);
        const result = safeParseCron(expression);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.index).toBe(0);
    });

    it('normalizes surrounding and repeated whitespace', () => {
        expect(parseCron('  0\t0 *   * * ')).toEqual(parseCron('0 0 * * *'));
    });
});

describe('day modifiers', () => {
    it('reads L, L-n, W and LW', () => {
        expect(parseCron('0 0 L * *').dom.lastOffsets).toEqual([0]);
        expect(parseCron('0 0 L-3 * *').dom.lastOffsets).toEqual([3]);
        expect(parseCron('0 0 15W * *').dom.nearestWeekday).toEqual([15]);
        expect(parseCron('0 0 LW * *').dom.lastWeekday).toBe(true);
    });

    it('reads nL and n#k', () => {
        expect(parseCron('0 0 * * 5L').dow.last).toEqual([5]);
        expect(parseCron('0 0 * * MONL').dow.last).toEqual([1]);
        expect(parseCron('0 0 * * 1#3').dow.nth).toEqual([{ day: 1, nth: 3 }]);
    });

    it('treats ? as a wildcard that leaves the field unrestricted', () => {
        const schedule = parseCron('0 0 ? * MON');
        expect(schedule.dom.restricted).toBe(false);
        expect(schedule.dom.days).toHaveLength(31);
        expect(schedule.dow.restricted).toBe(true);
    });

    it('counts a leading star as unrestricted, exactly as crontab does', () => {
        expect(parseCron('0 0 */2 * *').dom.restricted).toBe(false);
        expect(parseCron('0 0 1-31 * *').dom.restricted).toBe(true);
    });
});

describe('errors', () => {
    it('names the field, the source and the offset', () => {
        try {
            parseCron('0 0 * * 9');
            expect.unreachable('should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(CronSyntaxError);
            const failure = error as CronSyntaxError;
            expect(failure.field).toBe('dayOfWeek');
            expect(failure.index).toBe(8);
            expect(failure.source).toBe('0 0 * * 9');
            expect(failure.message).toMatch(/cron-primitives: 9 is out of range 0-7/);
        }
    });

    it.each([
        ['', /expression is empty/],
        ['0 0 * *', /expected 5 fields/],
        ['0 0 * * * * *', /expected 5 fields/],
        ['0 6x * * *', /unexpected "6x"/],
        ['60 * * * *', /out of range 0-59/],
        ['0 0 0 * *', /out of range 1-31/],
        ['0 0 * 13 *', /out of range 1-12/],
        ['*/0 * * * *', /step must be a positive integer/],
        ['*/61 * * * *', /step 61 is larger than the field/],
        ['0 0 , * *', /empty term/],
        ['0 0 * * 1#9', /#9 must be between 1 and 5/],
        ['0 0 L-31 * *', /reaches past the start/],
        ['@nope', /unknown macro/],
    ])('rejects %s', (expression, message) => {
        expect(() => parseCron(expression)).toThrow(message);
    });

    it('hands the same failure back unthrown', () => {
        const result = safeParseCron('0 0 * * 9');
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.field).toBe('dayOfWeek');
        expect(safeParseCron('0 0 * * 1').ok).toBe(true);
    });
});

describe('serialization', () => {
    it('survives a round trip through JSON', () => {
        const schedule = parseCron('0 30 2 L,15W 1,6 5#3', { domDowMode: 'and' });
        expect(JSON.parse(JSON.stringify(schedule))).toEqual(schedule);
    });
});
