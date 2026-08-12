import { PREFIX } from '../core/errors';
import type { Wall, WallInput } from '../core/types';

export type { WallInput };

export const SECOND = 1000;
export const DAY = 86_400_000;

const PROBE = 7 * DAY;

const formatters = new Map<string, Intl.DateTimeFormat>();
const offsets = new Map<string, number>();
const OFFSET_CACHE_MAX = 2048;

function isUtc(tz: string): boolean {
    return tz === 'UTC' || tz === 'Etc/UTC' || tz === 'Etc/GMT' || tz === 'GMT';
}

function formatterFor(tz: string): Intl.DateTimeFormat {
    let formatter = formatters.get(tz);
    if (formatter === undefined) {
        try {
            formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: tz,
                hourCycle: 'h23',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
            });
        } catch {
            throw new RangeError(`${PREFIX}: unknown time zone ${JSON.stringify(tz)}`);
        }
        formatters.set(tz, formatter);
    }
    return formatter;
}

export function floorToSecond(t: number): number {
    return Math.floor(t / SECOND) * SECOND;
}

export function offsetMsAt(tz: string, t: number): number {
    if (isUtc(tz)) return 0;

    const floored = floorToSecond(t);
    const key = `${tz}|${floored}`;
    const cached = offsets.get(key);
    if (cached !== undefined) return cached;

    const parts = formatterFor(tz).formatToParts(floored);
    let year = 0;
    let month = 1;
    let day = 1;
    let hour = 0;
    let minute = 0;
    let second = 0;
    for (const part of parts) {
        switch (part.type) {
            case 'year':
                year = Number(part.value);
                break;
            case 'month':
                month = Number(part.value);
                break;
            case 'day':
                day = Number(part.value);
                break;
            case 'hour':
                hour = Number(part.value) % 24;
                break;
            case 'minute':
                minute = Number(part.value);
                break;
            case 'second':
                second = Number(part.value);
                break;
        }
    }

    const offset = Date.UTC(year, month - 1, day, hour, minute, second) - floored;
    if (offsets.size >= OFFSET_CACHE_MAX) offsets.clear();
    offsets.set(key, offset);
    return offset;
}

export function wallFromOffset(t: number, offsetMs: number): Wall {
    const shifted = new Date(floorToSecond(t) + offsetMs);
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
        hour: shifted.getUTCHours(),
        minute: shifted.getUTCMinutes(),
        second: shifted.getUTCSeconds(),
        weekday: shifted.getUTCDay(),
    };
}

export function wallToEpoch(wall: WallInput, offsetMs: number): number {
    return wallAsUtc(wall) - offsetMs;
}

export function wallAsUtc(wall: WallInput): number {
    return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
}

function sameWall(a: Wall, b: WallInput): boolean {
    return (
        a.year === b.year &&
        a.month === b.month &&
        a.day === b.day &&
        a.hour === b.hour &&
        a.minute === b.minute &&
        a.second === b.second
    );
}

function bisect(
    tz: string,
    loMs: number,
    hiMs: number,
    test: (offsetMs: number) => boolean
): number {
    let lo = Math.floor(loMs / SECOND);
    let hi = Math.ceil(hiMs / SECOND);
    while (hi - lo > 1) {
        const mid = lo + Math.floor((hi - lo) / 2);
        if (test(offsetMsAt(tz, mid * SECOND))) hi = mid;
        else lo = mid;
    }
    return hi * SECOND;
}

export function nextTransition(
    tz: string,
    from: number,
    limit: number,
    offsetMs: number
): number | null {
    if (isUtc(tz)) return null;
    let lo = from;
    while (lo < limit) {
        const hi = Math.min(lo + PROBE, limit);
        if (offsetMsAt(tz, hi) !== offsetMs) return bisect(tz, lo, hi, o => o !== offsetMs);
        lo = hi;
    }
    return null;
}

export function segmentStart(tz: string, until: number, floor: number, offsetMs: number): number {
    if (isUtc(tz)) return floor;
    let hi = until;
    while (hi > floor) {
        const lo = Math.max(hi - PROBE, floor);
        if (offsetMsAt(tz, lo) !== offsetMs) return bisect(tz, lo, hi, o => o === offsetMs);
        hi = lo;
    }
    return floor;
}

export type WallResolution =
    | { kind: 'unique'; instants: [number] }
    | { kind: 'ambiguous'; instants: [number, number] }
    | { kind: 'gap'; instants: []; gapEndsAt: number };

export function resolveWall(tz: string, wall: WallInput): WallResolution {
    const naive = wallAsUtc(wall);
    if (isUtc(tz)) return { kind: 'unique', instants: [naive] };

    const before = offsetMsAt(tz, naive - DAY);
    const after = offsetMsAt(tz, naive + DAY);
    const candidates = before === after ? [naive - before] : [naive - before, naive - after];
    const valid = candidates
        .filter(t => sameWall(wallFromOffset(t, offsetMsAt(tz, t)), wall))
        .sort((a, b) => a - b);

    if (valid.length === 1) return { kind: 'unique', instants: [valid[0] as number] };
    if (valid.length >= 2) {
        return { kind: 'ambiguous', instants: [valid[0] as number, valid[1] as number] };
    }

    const lo = Math.min(naive - before, naive - after);
    const hi = Math.max(naive - before, naive - after);
    const offsetAtLo = offsetMsAt(tz, lo);
    const gapEndsAt = bisect(tz, lo, hi, o => o !== offsetAtLo);
    return { kind: 'gap', instants: [], gapEndsAt };
}

export function clearTimeZoneCache(): void {
    formatters.clear();
    offsets.clear();
}
