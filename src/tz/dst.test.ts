import { describe, expect, it } from 'vitest';
import { at, iso, isoAll } from '../testUtils';
import { clearTimeZoneCache, epochFromWall, offsetAt, wallFromEpoch } from './index';

const wall = (
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    second = 0
) => ({ year, month, day, hour, minute, second });

describe('offsetAt', () => {
    it.each([
        ['UTC', '2026-06-01T00:00:00Z', 0],
        ['America/New_York', '2026-01-15T12:00:00Z', -300],
        ['America/New_York', '2026-06-15T12:00:00Z', -240],
        ['Asia/Kathmandu', '2026-06-15T12:00:00Z', 345],
        ['Pacific/Chatham', '2026-01-15T12:00:00Z', 825],
        ['Pacific/Chatham', '2026-06-15T12:00:00Z', 765],
        ['Australia/Lord_Howe', '2026-01-15T12:00:00Z', 660],
        ['Australia/Lord_Howe', '2026-06-15T12:00:00Z', 630],
        ['Asia/Tehran', '2026-06-15T12:00:00Z', 210],
    ])('%s at %s is %i minutes', (tz, instant, expected) => {
        expect(offsetAt(tz, at(instant))).toBe(expected);
    });

    it('rejects a zone ICU does not know', () => {
        expect(() => offsetAt('Mars/Olympus_Mons', 0)).toThrow(/unknown time zone/);
    });
});

describe('wallFromEpoch', () => {
    it('reads the wall clock, weekday included', () => {
        expect(wallFromEpoch('Asia/Kathmandu', at('2026-06-15T12:00:00Z'))).toEqual({
            year: 2026,
            month: 6,
            day: 15,
            hour: 17,
            minute: 45,
            second: 0,
            weekday: 1,
        });
    });

    it('truncates sub-second input rather than rounding it', () => {
        expect(wallFromEpoch('UTC', at('2026-06-15T12:00:00Z') + 999).second).toBe(0);
    });
});

describe('epochFromWall', () => {
    it('resolves an ordinary reading to one instant', () => {
        const resolved = epochFromWall('Europe/Warsaw', wall(2026, 6, 15, 12, 0));
        expect(resolved.kind).toBe('unique');
        expect(isoAll(resolved.instants)).toEqual(['2026-06-15T10:00:00.000Z']);
    });

    it('resolves a duplicated reading to both instants, ascending', () => {
        const resolved = epochFromWall('America/New_York', wall(2026, 11, 1, 1, 30));
        expect(resolved.kind).toBe('ambiguous');
        expect(isoAll(resolved.instants)).toEqual([
            '2026-11-01T05:30:00.000Z',
            '2026-11-01T06:30:00.000Z',
        ]);
    });

    it('resolves a deleted reading to nothing, and points at the far side of the gap', () => {
        const resolved = epochFromWall('America/New_York', wall(2026, 3, 8, 2, 30));
        expect(resolved.kind).toBe('gap');
        expect(resolved.instants).toEqual([]);
        if (resolved.kind === 'gap') {
            expect(iso(resolved.gapEndsAt)).toBe('2026-03-08T07:00:00.000Z');
        }
    });

    it('handles a thirty-minute shift', () => {
        const duplicated = epochFromWall('Australia/Lord_Howe', wall(2026, 4, 5, 1, 45));
        expect(duplicated.kind).toBe('ambiguous');
        expect(isoAll(duplicated.instants)).toEqual([
            '2026-04-04T14:45:00.000Z',
            '2026-04-04T15:15:00.000Z',
        ]);

        const untouched = epochFromWall('Australia/Lord_Howe', wall(2026, 4, 5, 1, 15));
        expect(untouched.kind).toBe('unique');

        const deleted = epochFromWall('Australia/Lord_Howe', wall(2026, 10, 4, 2, 15));
        expect(deleted.kind).toBe('gap');
        if (deleted.kind === 'gap') {
            expect(iso(deleted.gapEndsAt)).toBe('2026-10-03T15:30:00.000Z');
        }
    });

    it('handles a forty-five-minute offset', () => {
        const deleted = epochFromWall('Pacific/Chatham', wall(2026, 9, 27, 3, 0));
        expect(deleted.kind).toBe('gap');
        if (deleted.kind === 'gap') {
            expect(iso(deleted.gapEndsAt)).toBe('2026-09-26T14:00:00.000Z');
        }
        expect(epochFromWall('Pacific/Chatham', wall(2026, 9, 27, 2, 30)).kind).toBe('unique');
    });

    it('handles a transition that deletes midnight', () => {
        const deleted = epochFromWall('America/Santiago', wall(2026, 9, 6, 0, 0));
        expect(deleted.kind).toBe('gap');
        if (deleted.kind === 'gap') {
            expect(iso(deleted.gapEndsAt)).toBe('2026-09-06T04:00:00.000Z');
        }
    });

    it('handles a country that reintroduced DST', () => {
        expect(epochFromWall('Africa/Cairo', wall(2026, 4, 24, 0, 30)).kind).toBe('gap');
        expect(epochFromWall('Africa/Cairo', wall(2026, 10, 29, 23, 30)).kind).toBe('ambiguous');
    });

    it('handles a country that abolished DST', () => {
        expect(epochFromWall('Asia/Tehran', wall(2026, 3, 22, 0, 30)).kind).toBe('unique');
    });

    it('handles the day Samoa deleted', () => {
        expect(epochFromWall('Pacific/Apia', wall(2011, 12, 30, 12, 0)).kind).toBe('gap');
        expect(epochFromWall('Pacific/Apia', wall(2011, 12, 29, 12, 0)).kind).toBe('unique');
    });
});

describe('caching', () => {
    it('answers the same after the cache is dropped', () => {
        const instant = at('2026-11-01T05:30:00Z');
        const before = offsetAt('America/New_York', instant);
        clearTimeZoneCache();
        expect(offsetAt('America/New_York', instant)).toBe(before);
    });
});
