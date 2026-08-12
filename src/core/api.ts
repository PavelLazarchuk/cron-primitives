import { PREFIX } from './errors';
import { matchesInstant, nextInstant, prevInstant } from './search';
import type { CronSchedule, Options } from './types';

/**
 * The next instant the schedule fires, strictly after `after`.
 *
 * Returns `null` when there is none within the horizon — `0 0 30 2 *` never
 * fires, and saying so beats spinning.
 */
export function next(schedule: CronSchedule, after: number, options?: Options): number | null {
    return nextInstant(schedule, after, options);
}

/** The most recent instant the schedule fired, strictly before `before`. */
export function prev(schedule: CronSchedule, before: number, options?: Options): number | null {
    return prevInstant(schedule, before, options);
}

/** Whether an instant is a wall-clock match, to the second. */
export function matches(schedule: CronSchedule, instant: number, options?: Options): boolean {
    return matchesInstant(schedule, instant, options);
}

/**
 * The next `count` instants, ascending.
 *
 * Comes back short when the horizon runs out. The horizon bounds each step, not
 * the whole list — every instant here is within `maxYears` of the one before it.
 */
export function nextN(
    schedule: CronSchedule,
    after: number,
    count: number,
    options?: Options
): number[] {
    if (!Number.isInteger(count) || count < 0) {
        throw new TypeError(
            `${PREFIX}: count must be a non-negative integer, received ${String(count)}`
        );
    }

    const result: number[] = [];
    let cursor = after;
    for (let i = 0; i < count; i += 1) {
        const instant = nextInstant(schedule, cursor, options);
        if (instant === null) break;
        result.push(instant);
        cursor = instant;
    }
    return result;
}

/**
 * Every instant in `(from, to]`, ascending and lazily.
 *
 * ```ts
 * for (const at of occurrences(schedule, { from: startOfMonth, to: endOfMonth })) …
 * ```
 */
export function* occurrences(
    schedule: CronSchedule,
    range: { from: number; to: number },
    options?: Options
): Generator<number, void, undefined> {
    let cursor = range.from;
    for (;;) {
        const instant = nextInstant(schedule, cursor, options);
        if (instant === null || instant > range.to) return;
        yield instant;
        cursor = instant;
    }
}
