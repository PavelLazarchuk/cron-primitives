import type { DomField, DowField } from './types';

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isLeapYear(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
    if (month === 2 && isLeapYear(year)) return 29;
    return MONTH_LENGTHS[month - 1] ?? 30;
}

export function weekdayOf(year: number, month: number, day: number): number {
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function nearestWeekdayTo(year: number, month: number, target: number): number {
    const last = daysInMonth(year, month);
    const day = Math.min(target, last);
    const weekday = weekdayOf(year, month, day);
    if (weekday === 6) return day > 1 ? day - 1 : day + 2;
    if (weekday === 0) return day < last ? day + 1 : day - 2;
    return day;
}

export function lastWeekdayOf(year: number, month: number): number {
    let day = daysInMonth(year, month);
    for (;;) {
        const weekday = weekdayOf(year, month, day);
        if (weekday !== 0 && weekday !== 6) return day;
        day -= 1;
    }
}

export function domMatches(
    dom: DomField,
    days: ReadonlySet<number>,
    year: number,
    month: number,
    day: number
): boolean {
    if (days.has(day)) return true;
    if (dom.lastOffsets.length > 0) {
        const last = daysInMonth(year, month);
        for (const offset of dom.lastOffsets) if (last - offset === day) return true;
    }
    for (const target of dom.nearestWeekday) {
        if (nearestWeekdayTo(year, month, target) === day) return true;
    }
    if (dom.lastWeekday && lastWeekdayOf(year, month) === day) return true;
    return false;
}

export function dowMatches(
    dow: DowField,
    days: ReadonlySet<number>,
    year: number,
    month: number,
    day: number
): boolean {
    const weekday = weekdayOf(year, month, day);
    if (days.has(weekday)) return true;
    if (dow.nth.length > 0) {
        const position = Math.floor((day - 1) / 7) + 1;
        for (const entry of dow.nth) {
            if (entry.day === weekday && entry.nth === position) return true;
        }
    }
    if (dow.last.length > 0 && day + 7 > daysInMonth(year, month)) {
        for (const weekdayOfLast of dow.last) if (weekdayOfLast === weekday) return true;
    }
    return false;
}
