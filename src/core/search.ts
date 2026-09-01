import { compile, dayMatches } from './compile';
import { assertFinite, PREFIX } from './errors';
import type { AmbiguousPolicy, CronSchedule, NonexistentPolicy, Options, WallInput } from './types';
import { nextWallMatch, prevWallMatch } from './walk';
import {
    DAY,
    floorToSecond,
    nextTransition,
    offsetMsAt,
    resolveWall,
    SECOND,
    segmentStart,
    wallFromOffset,
    wallToEpoch,
} from '../tz/zone';

const YEAR = 365.2425 * DAY;

const SEGMENTS = 512;

interface ResolvedOptions {
    tz: string;
    nonexistent: NonexistentPolicy;
    ambiguous: AmbiguousPolicy;
    maxYears: number;
}

export function isReboot(schedule: CronSchedule): boolean {
    return schedule.reboot === true;
}

/**
 * Vixie's rule, and the one users' intuitions already match: a schedule whose
 * minute or hour field covers its whole range is an interval, and intervals
 * follow absolute time across a transition — they neither repeat nor skip. Any
 * other schedule names a wall-clock time, and a wall-clock time is exactly what
 * DST takes away and gives back twice.
 */
export function isInterval(schedule: CronSchedule): boolean {
    if (schedule.reboot === true) return false;
    const c = compile(schedule);
    return (
        c.hour.length === 24 ||
        c.minute.length === 60 ||
        (schedule.hasSeconds && c.second.length === 60)
    );
}

export function resolveOptions(schedule: CronSchedule, options: Options = {}): ResolvedOptions {
    const interval = isInterval(schedule);
    const maxYears = options.maxYears ?? 5;
    if (!Number.isFinite(maxYears) || maxYears <= 0) {
        throw new TypeError(
            `${PREFIX}: maxYears must be a number greater than 0, received ${String(maxYears)}`
        );
    }
    return {
        tz: options.tz ?? 'UTC',
        nonexistent: options.nonexistent ?? (interval ? 'skip' : 'shiftForward'),
        ambiguous: options.ambiguous ?? (interval ? 'both' : 'first'),
        maxYears,
    };
}

function formatWall(wall: WallInput): string {
    const pad = (value: number, width = 2): string => String(value).padStart(width, '0');
    return `${pad(wall.year, 4)}-${pad(wall.month)}-${pad(wall.day)}T${pad(wall.hour)}:${pad(wall.minute)}:${pad(wall.second)}`;
}

function gapError(wall: WallInput, tz: string): RangeError {
    return new RangeError(`${PREFIX}: ${formatWall(wall)} does not exist in ${tz}`);
}

function ambiguousTwin(tz: string, wall: WallInput, instant: number): number | undefined {
    const resolution = resolveWall(tz, wall);
    if (resolution.kind !== 'ambiguous') return undefined;
    const [first, second] = resolution.instants;
    return first === instant ? second : first;
}

function keepsAmbiguous(policy: AmbiguousPolicy, instant: number, twin: number): boolean {
    return policy === 'first' ? instant < twin : instant > twin;
}

export function nextInstant(
    schedule: CronSchedule,
    after: number,
    options: Options = {}
): number | null {
    assertFinite(after, 'after');
    if (schedule.reboot === true) return null;
    const c = compile(schedule);
    const opt = resolveOptions(schedule, options);
    const deadline = after + opt.maxYears * YEAR;

    let from = floorToSecond(after) + SECOND;
    for (let segment = 0; segment < SEGMENTS; segment += 1) {
        if (from > deadline) return null;

        const offset = offsetMsAt(opt.tz, from);
        const wall = wallFromOffset(from, offset);
        const match = nextWallMatch(c, wall, wall.year + opt.maxYears + 1);
        if (match === null) return null;

        const candidate = wallToEpoch(match, offset);
        if (candidate > deadline) return null;

        if (offsetMsAt(opt.tz, candidate) === offset) {
            if (opt.ambiguous === 'both') return candidate;
            const twin = ambiguousTwin(opt.tz, match, candidate);
            if (twin === undefined || keepsAmbiguous(opt.ambiguous, candidate, twin))
                return candidate;
            from = candidate + SECOND;
            continue;
        }

        const transition = nextTransition(opt.tz, from, candidate, offset);
        if (transition === null) return candidate;

        const shifted = offsetMsAt(opt.tz, transition);
        if (shifted > offset && wallToEpoch(match, shifted) < transition) {
            if (opt.nonexistent === 'throw') throw gapError(match, opt.tz);
            if (opt.nonexistent === 'shiftForward') return transition;
        }
        from = transition;
    }

    return null;
}

export function prevInstant(
    schedule: CronSchedule,
    before: number,
    options: Options = {}
): number | null {
    assertFinite(before, 'before');
    if (schedule.reboot === true) return null;
    const c = compile(schedule);
    const opt = resolveOptions(schedule, options);
    const floor = before - opt.maxYears * YEAR;

    let until = Math.ceil(before / SECOND) * SECOND - SECOND;
    for (let segment = 0; segment < SEGMENTS; segment += 1) {
        if (until < floor) return null;

        const offset = offsetMsAt(opt.tz, until);
        const wall = wallFromOffset(until, offset);
        const match = prevWallMatch(c, wall, wall.year - opt.maxYears - 1);
        if (match === null) return null;

        const candidate = wallToEpoch(match, offset);
        if (candidate < floor) return null;

        if (offsetMsAt(opt.tz, candidate) === offset) {
            if (opt.ambiguous === 'both') return candidate;
            const twin = ambiguousTwin(opt.tz, match, candidate);
            if (twin === undefined || keepsAmbiguous(opt.ambiguous, candidate, twin))
                return candidate;
            until = candidate - SECOND;
            continue;
        }

        const start = segmentStart(opt.tz, until, candidate, offset);
        const previous = offsetMsAt(opt.tz, start - SECOND);
        if (offset > previous && wallToEpoch(match, previous) >= start) {
            if (opt.nonexistent === 'throw') throw gapError(match, opt.tz);
            if (opt.nonexistent === 'shiftForward') return start;
        }
        until = start - SECOND;
    }

    return null;
}

export function matchesInstant(
    schedule: CronSchedule,
    instant: number,
    options: Options = {}
): boolean {
    assertFinite(instant, 'instant');
    if (schedule.reboot === true) return false;
    const c = compile(schedule);
    const opt = resolveOptions(schedule, options);
    const wall = wallFromOffset(instant, offsetMsAt(opt.tz, instant));
    return (
        (c.yearSet === null || c.yearSet.has(wall.year)) &&
        c.secondSet.has(wall.second) &&
        c.minuteSet.has(wall.minute) &&
        c.hourSet.has(wall.hour) &&
        c.monthSet.has(wall.month) &&
        dayMatches(c, wall.year, wall.month, wall.day)
    );
}
