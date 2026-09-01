import { daysInMonth } from './calendar';
import { dayMatches, type Compiled } from './compile';
import type { WallInput } from './types';

interface Cursor {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
}

const GUARD = 200_000;

function nextIn(list: number[], value: number): number | undefined {
    for (const item of list) if (item >= value) return item;
    return undefined;
}

function prevIn(list: number[], value: number): number | undefined {
    for (let i = list.length - 1; i >= 0; i -= 1) {
        const item = list[i];
        if (item !== undefined && item <= value) return item;
    }
    return undefined;
}

function firstOf(list: number[]): number {
    return list[0] ?? 0;
}

function lastOf(list: number[]): number {
    return list[list.length - 1] ?? 0;
}

function startOf(cursor: Cursor): void {
    cursor.hour = 0;
    cursor.minute = 0;
    cursor.second = 0;
}

function endOf(cursor: Cursor): void {
    cursor.hour = 23;
    cursor.minute = 59;
    cursor.second = 59;
}

function nextDay(cursor: Cursor): void {
    cursor.day += 1;
    if (cursor.day > daysInMonth(cursor.year, cursor.month)) {
        cursor.day = 1;
        cursor.month += 1;
        if (cursor.month > 12) {
            cursor.month = 1;
            cursor.year += 1;
        }
    }
    startOf(cursor);
}

function prevDay(cursor: Cursor): void {
    cursor.day -= 1;
    if (cursor.day < 1) {
        cursor.month -= 1;
        if (cursor.month < 1) {
            cursor.month = 12;
            cursor.year -= 1;
        }
        cursor.day = daysInMonth(cursor.year, cursor.month);
    }
    endOf(cursor);
}

function cursorFrom(wall: WallInput): Cursor {
    return {
        year: wall.year,
        month: wall.month,
        day: wall.day,
        hour: wall.hour,
        minute: wall.minute,
        second: wall.second,
    };
}

export function nextWallMatch(c: Compiled, from: WallInput, maxYear: number): WallInput | null {
    const { second, minute, hour, month, year, yearSet } = c;
    const cursor = cursorFrom(from);

    for (let guard = 0; guard < GUARD; guard += 1) {
        if (cursor.year > maxYear) return null;

        if (year !== null && yearSet !== null && !yearSet.has(cursor.year)) {
            const value = nextIn(year, cursor.year);
            if (value === undefined) return null;
            cursor.year = value;
            cursor.month = 1;
            cursor.day = 1;
            startOf(cursor);
            continue;
        }

        if (!c.monthSet.has(cursor.month)) {
            const value = nextIn(month, cursor.month);
            if (value === undefined) {
                cursor.year += 1;
                cursor.month = firstOf(month);
            } else {
                cursor.month = value;
            }
            cursor.day = 1;
            startOf(cursor);
            continue;
        }

        if (
            cursor.day > daysInMonth(cursor.year, cursor.month) ||
            !dayMatches(c, cursor.year, cursor.month, cursor.day)
        ) {
            nextDay(cursor);
            continue;
        }

        if (!c.hourSet.has(cursor.hour)) {
            const value = nextIn(hour, cursor.hour);
            if (value === undefined) {
                nextDay(cursor);
            } else {
                cursor.hour = value;
                cursor.minute = 0;
                cursor.second = 0;
            }
            continue;
        }

        if (!c.minuteSet.has(cursor.minute)) {
            const value = nextIn(minute, cursor.minute);
            if (value === undefined) {
                cursor.hour += 1;
                cursor.minute = 0;
                cursor.second = 0;
                if (cursor.hour > 23) nextDay(cursor);
            } else {
                cursor.minute = value;
                cursor.second = 0;
            }
            continue;
        }

        if (!c.secondSet.has(cursor.second)) {
            const value = nextIn(second, cursor.second);
            if (value === undefined) {
                cursor.minute += 1;
                cursor.second = 0;
                if (cursor.minute > 59) {
                    cursor.minute = 0;
                    cursor.hour += 1;
                    if (cursor.hour > 23) nextDay(cursor);
                }
            } else {
                cursor.second = value;
            }
            continue;
        }

        return cursor;
    }

    return null;
}

export function prevWallMatch(c: Compiled, from: WallInput, minYear: number): WallInput | null {
    const { second, minute, hour, month, year, yearSet } = c;
    const cursor = cursorFrom(from);

    for (let guard = 0; guard < GUARD; guard += 1) {
        if (cursor.year < minYear) return null;

        if (year !== null && yearSet !== null && !yearSet.has(cursor.year)) {
            const value = prevIn(year, cursor.year);
            if (value === undefined) return null;
            cursor.year = value;
            cursor.month = 12;
            cursor.day = 31;
            endOf(cursor);
            continue;
        }

        if (!c.monthSet.has(cursor.month)) {
            const value = prevIn(month, cursor.month);
            if (value === undefined) {
                cursor.year -= 1;
                cursor.month = lastOf(month);
            } else {
                cursor.month = value;
            }
            cursor.day = daysInMonth(cursor.year, cursor.month);
            endOf(cursor);
            continue;
        }

        if (cursor.day > daysInMonth(cursor.year, cursor.month)) {
            cursor.day = daysInMonth(cursor.year, cursor.month);
            endOf(cursor);
            continue;
        }

        if (!dayMatches(c, cursor.year, cursor.month, cursor.day)) {
            prevDay(cursor);
            continue;
        }

        if (!c.hourSet.has(cursor.hour)) {
            const value = prevIn(hour, cursor.hour);
            if (value === undefined) {
                prevDay(cursor);
            } else {
                cursor.hour = value;
                cursor.minute = 59;
                cursor.second = 59;
            }
            continue;
        }

        if (!c.minuteSet.has(cursor.minute)) {
            const value = prevIn(minute, cursor.minute);
            if (value === undefined) {
                cursor.hour -= 1;
                cursor.minute = 59;
                cursor.second = 59;
                if (cursor.hour < 0) prevDay(cursor);
            } else {
                cursor.minute = value;
                cursor.second = 59;
            }
            continue;
        }

        if (!c.secondSet.has(cursor.second)) {
            const value = prevIn(second, cursor.second);
            if (value === undefined) {
                cursor.minute -= 1;
                cursor.second = 59;
                if (cursor.minute < 0) {
                    cursor.minute = 59;
                    cursor.hour -= 1;
                    if (cursor.hour < 0) prevDay(cursor);
                }
            } else {
                cursor.second = value;
            }
            continue;
        }

        return cursor;
    }

    return null;
}
