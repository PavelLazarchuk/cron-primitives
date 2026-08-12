import { describe, expect, it } from 'vitest';
import { parseCron } from '../cron/parse';
import { at, iso, isoAll } from '../testUtils';
import { dueSince, isDue } from './dueSince';

const hourly = parseCron('0 * * * *');

describe('dueSince', () => {
    it('returns what was missed, ascending, and the state to store', () => {
        const result = dueSince(
            hourly,
            { lastRunAt: at('2026-01-01T00:00:00Z') },
            at('2026-01-01T05:30:00Z')
        );
        expect(isoAll(result.due)).toEqual([
            '2026-01-01T01:00:00.000Z',
            '2026-01-01T02:00:00.000Z',
            '2026-01-01T03:00:00.000Z',
            '2026-01-01T04:00:00.000Z',
            '2026-01-01T05:00:00.000Z',
        ]);
        expect(iso(result.state.lastRunAt)).toBe('2026-01-01T05:00:00.000Z');
        expect(result.truncated).toBe(false);
    });

    it('includes an occurrence landing exactly on now', () => {
        const result = dueSince(
            hourly,
            { lastRunAt: at('2026-01-01T00:00:00Z') },
            at('2026-01-01T01:00:00Z')
        );
        expect(isoAll(result.due)).toEqual(['2026-01-01T01:00:00.000Z']);
    });

    it('is idempotent — draining twice owes nothing the second time', () => {
        const now = at('2026-01-01T05:30:00Z');
        const first = dueSince(hourly, { lastRunAt: at('2026-01-01T00:00:00Z') }, now);
        const second = dueSince(hourly, first.state, now);
        expect(second.due).toEqual([]);
        expect(second.state).toEqual(first.state);
    });

    it('keeps the most recent occurrences when the outage was long', () => {
        const result = dueSince(
            hourly,
            { lastRunAt: at('2026-01-01T00:00:00Z') },
            at('2026-01-05T00:00:00Z'),
            { maxCatchUp: 3 }
        );
        expect(isoAll(result.due)).toEqual([
            '2026-01-04T22:00:00.000Z',
            '2026-01-04T23:00:00.000Z',
            '2026-01-05T00:00:00.000Z',
        ]);
        expect(result.truncated).toBe(true);
        expect(iso(result.state.lastRunAt)).toBe('2026-01-05T00:00:00.000Z');
    });

    it('owes nothing when now is not past the last run', () => {
        const state = { lastRunAt: at('2026-01-01T05:00:00Z') };
        expect(dueSince(hourly, state, at('2026-01-01T05:00:00Z')).due).toEqual([]);
        expect(dueSince(hourly, state, at('2026-01-01T04:00:00Z')).state).toBe(state);
        expect(dueSince(hourly, state, at('2026-01-01T05:30:00Z')).due).toEqual([]);
    });

    it('survives a round trip through JSON, as any stored state must', () => {
        const now = at('2026-01-01T05:30:00Z');
        const first = dueSince(hourly, { lastRunAt: at('2026-01-01T00:00:00Z') }, now);
        const revived = JSON.parse(JSON.stringify(first.state));
        expect(dueSince(hourly, revived, at('2026-01-01T07:30:00Z')).due).toHaveLength(2);
    });

    it('applies the DST policy it was given', () => {
        const window = {
            state: { lastRunAt: at('2026-11-01T04:30:00Z') },
            now: at('2026-11-01T07:30:00Z'),
        };
        const both = dueSince(hourly, window.state, window.now, { tz: 'America/New_York' });
        expect(isoAll(both.due)).toEqual([
            '2026-11-01T05:00:00.000Z',
            '2026-11-01T06:00:00.000Z',
            '2026-11-01T07:00:00.000Z',
        ]);

        const once = dueSince(parseCron('30 1 * * *'), window.state, window.now, {
            tz: 'America/New_York',
        });
        expect(isoAll(once.due)).toEqual(['2026-11-01T05:30:00.000Z']);
    });

    it('rejects a state or a limit it cannot work with', () => {
        expect(() => dueSince(hourly, { lastRunAt: Number.NaN }, 0)).toThrow(/lastRunAt/);
        expect(() => dueSince(hourly, { lastRunAt: 0 }, 1, { maxCatchUp: 0 })).toThrow(
            /maxCatchUp/
        );
    });
});

describe('isDue', () => {
    it('answers without enumerating anything', () => {
        const state = { lastRunAt: at('2026-01-01T00:00:00Z') };
        expect(isDue(hourly, state, at('2026-01-01T00:59:00Z'))).toBe(false);
        expect(isDue(hourly, state, at('2026-01-01T01:00:00Z'))).toBe(true);
        expect(isDue(parseCron('0 0 30 2 *'), state, at('2030-01-01T00:00:00Z'))).toBe(false);
    });
});
