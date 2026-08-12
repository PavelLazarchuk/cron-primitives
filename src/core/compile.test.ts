import { describe, expect, it } from 'vitest';
import { parseCron } from '../cron/parse';
import { at, iso } from '../testUtils';
import { next } from './api';
import { isInterval } from './search';
import type { CronSchedule } from './types';

const T0 = at('2026-01-01T00:00:00Z');

function restored(expression: string, patch: Partial<CronSchedule> = {}): CronSchedule {
    return { ...(JSON.parse(JSON.stringify(parseCron(expression))) as CronSchedule), ...patch };
}

describe('a restored schedule', () => {
    it('survives the round trip through JSON', () => {
        const schedule = parseCron('30 9 * * 1-5');
        expect(next(restored('30 9 * * 1-5'), T0)).toBe(next(schedule, T0));
    });

    it('is rejected when a field is empty', () => {
        expect(() => next(restored('0 9 * * *', { minute: [] }), T0)).toThrow(
            /schedule has no minute values/
        );
        expect(() => next(restored('0 9 * * *', { hour: undefined as never }), T0)).toThrow(
            /schedule has no hour values/
        );
    });

    it('is rejected when a value is out of range, rather than inventing a wall time', () => {
        const cases: Array<[Partial<CronSchedule>, RegExp]> = [
            [{ minute: [99] }, /out-of-range minute value 99/],
            [{ hour: [24] }, /out-of-range hour value 24/],
            [{ month: [13] }, /out-of-range month value 13/],
            [{ second: [60] }, /out-of-range second value 60/],
            [{ minute: [-1] }, /out-of-range minute value -1/],
            [{ minute: [1.5] }, /out-of-range minute value 1.5/],
            [{ hour: ['9' as never] }, /out-of-range hour value 9/],
        ];
        for (const [patch, message] of cases) {
            expect(() => next(restored('0 9 * * *', patch), T0)).toThrow(message);
        }
    });

    it('is rejected when a day field is out of range', () => {
        expect(() =>
            next(restored('0 9 1 * *', { dom: { ...parseCron('0 9 1 * *').dom, days: [32] } }), T0)
        ).toThrow(/out-of-range dayOfMonth value 32/);
        expect(() =>
            next(restored('0 9 * * 0', { dow: { ...parseCron('0 9 * * 0').dow, days: [7] } }), T0)
        ).toThrow(/out-of-range dayOfWeek value 7/);
    });

    it('is sorted before the walk, so an unordered field skips nothing', () => {
        expect(iso(next(restored('0 9 * * *', { hour: [5, 1, 9] }), T0))).toBe(
            '2026-01-01T01:00:00.000Z'
        );
    });

    it('is deduplicated, so repeated values do not read as an interval', () => {
        const repeated = restored('0 9 * * *', { minute: new Array<number>(60).fill(0) });
        expect(isInterval(repeated)).toBe(false);
        expect(iso(next(repeated, T0))).toBe('2026-01-01T09:00:00.000Z');
        expect(isInterval(restored('* * * * *'))).toBe(true);
    });
});
