import { assertFinite, assertPositiveInt } from '../core/errors';
import { nextInstant, prevInstant } from '../core/search';
import type { CatchUpState, CronSchedule, Options } from '../core/types';

export interface DueSinceOptions extends Options {
    maxCatchUp?: number;
}

export interface DueSinceResult {
    state: CatchUpState;
    due: number[];
    truncated: boolean;
}

/**
 * What the schedule owes you for the time you were away.
 *
 * The state is one number and it is yours — a column, a KV value, a field in
 * the Durable Object. Nothing here reads a clock or keeps anything.
 *
 * ```ts
 * const { state, due } = dueSince(schedule, saved, clock(), { tz: 'Europe/Warsaw' });
 * for (const firedAt of due) run(firedAt);
 * save(state);
 * ```
 */
export function dueSince(
    schedule: CronSchedule,
    state: CatchUpState,
    now: number,
    options: DueSinceOptions = {}
): DueSinceResult {
    assertFinite(now, 'now');
    assertFinite(state?.lastRunAt, 'state.lastRunAt');

    const limit = assertPositiveInt(options.maxCatchUp ?? 100, 'maxCatchUp');
    if (now <= state.lastRunAt) return { state, due: [], truncated: false };

    const newest: number[] = [];
    let truncated = false;
    let cursor = now + 1;
    for (;;) {
        const occurrence = prevInstant(schedule, cursor, options);
        if (occurrence === null || occurrence <= state.lastRunAt) break;
        if (newest.length >= limit) {
            truncated = true;
            break;
        }
        newest.push(occurrence);
        cursor = occurrence;
    }

    if (newest.length === 0) return { state, due: [], truncated: false };

    const due = newest.reverse();
    const lastRunAt = due[due.length - 1] ?? state.lastRunAt;
    return { state: { lastRunAt }, due, truncated };
}

/** Whether anything is owed — the cheap check before reaching for `dueSince`. */
export function isDue(
    schedule: CronSchedule,
    state: CatchUpState,
    now: number,
    options: Options = {}
): boolean {
    assertFinite(now, 'now');
    assertFinite(state?.lastRunAt, 'state.lastRunAt');
    const upcoming = nextInstant(schedule, state.lastRunAt, options);
    return upcoming !== null && upcoming <= now;
}
