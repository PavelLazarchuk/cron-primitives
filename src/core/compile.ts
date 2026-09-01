import { domMatches, dowMatches } from './calendar';
import { PREFIX } from './errors';
import type { CronSchedule, DomField, DowField } from './types';

export interface Compiled {
    schedule: CronSchedule;
    second: number[];
    minute: number[];
    hour: number[];
    month: number[];
    year: number[] | null;
    secondSet: ReadonlySet<number>;
    minuteSet: ReadonlySet<number>;
    hourSet: ReadonlySet<number>;
    monthSet: ReadonlySet<number>;
    yearSet: ReadonlySet<number> | null;
    dom: DomField;
    dow: DowField;
    domSet: ReadonlySet<number>;
    dowSet: ReadonlySet<number>;
    domDowMode: 'or' | 'and';
    bothDaysRestricted: boolean;
}

const cache = new WeakMap<CronSchedule, Compiled>();

/**
 * A schedule is plain JSON, so it can come back from a column or a KV value in
 * any shape at all. Normalizing here — sorted, deduplicated, in range — is what
 * lets the walk trust `nextIn`/`prevIn` to be ordered and every value it lands
 * on to be a real wall-clock value.
 */
function values(
    list: number[] | undefined,
    field: string,
    min: number,
    max: number,
    allowEmpty = false
): number[] {
    if (!Array.isArray(list) || (list.length === 0 && !allowEmpty)) {
        throw new TypeError(`${PREFIX}: schedule has no ${field} values`);
    }
    const seen = new Set<number>();
    for (const value of list) {
        if (!Number.isInteger(value) || value < min || value > max) {
            throw new TypeError(
                `${PREFIX}: schedule has an out-of-range ${field} value ${String(value)}, expected an integer in ${min}-${max}`
            );
        }
        seen.add(value);
    }
    return [...seen].sort((a, b) => a - b);
}

export function compile(schedule: CronSchedule): Compiled {
    const hit = cache.get(schedule);
    if (hit !== undefined) return hit;

    const second = values(schedule.second, 'second', 0, 59);
    const minute = values(schedule.minute, 'minute', 0, 59);
    const hour = values(schedule.hour, 'hour', 0, 23);
    const month = values(schedule.month, 'month', 1, 12);
    const year =
        schedule.year === undefined || schedule.year === null
            ? null
            : values(schedule.year, 'year', 1970, 2099);
    const dom = schedule.dom;
    const dow = schedule.dow;

    const compiled: Compiled = {
        schedule,
        second,
        minute,
        hour,
        month,
        year,
        secondSet: new Set(second),
        minuteSet: new Set(minute),
        hourSet: new Set(hour),
        monthSet: new Set(month),
        yearSet: year === null ? null : new Set(year),
        dom,
        dow,
        domSet: new Set(values(dom?.days, 'dayOfMonth', 1, 31, true)),
        dowSet: new Set(values(dow?.days, 'dayOfWeek', 0, 6, true)),
        domDowMode: schedule.domDowMode,
        bothDaysRestricted: dom.restricted && dow.restricted,
    };
    cache.set(schedule, compiled);
    return compiled;
}

export function dayMatches(c: Compiled, year: number, month: number, day: number): boolean {
    const byDom = domMatches(c.dom, c.domSet, year, month, day);
    if (c.bothDaysRestricted && c.domDowMode === 'or') {
        return byDom || dowMatches(c.dow, c.dowSet, year, month, day);
    }
    return byDom && dowMatches(c.dow, c.dowSet, year, month, day);
}
