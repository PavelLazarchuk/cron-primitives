import type { CronSchedule, DomField, DowField } from '../core/types';

export interface DescribeOptions {
    tz?: string;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const MONTH_NAMES = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
];

const NTH_WORDS = ['', 'first', 'second', 'third', 'fourth', 'fifth'];

function pad(value: number): string {
    return String(value).padStart(2, '0');
}

function ordinal(value: number): string {
    const teens = value % 100;
    if (teens >= 11 && teens <= 13) return `${value}th`;
    switch (value % 10) {
        case 1:
            return `${value}st`;
        case 2:
            return `${value}nd`;
        case 3:
            return `${value}rd`;
        default:
            return `${value}th`;
    }
}

function join(items: string[], word = 'and'): string {
    if (items.length === 0) return '';
    if (items.length === 1) return items[0] as string;
    return `${items.slice(0, -1).join(', ')} ${word} ${items[items.length - 1] as string}`;
}

function stepOf(list: number[], min: number, max: number): number | null {
    if (list.length < 2 || list[0] !== min) return null;
    const step = (list[1] as number) - (list[0] as number);
    for (let i = 1; i < list.length; i += 1) {
        if ((list[i] as number) - (list[i - 1] as number) !== step) return null;
    }
    if ((list[list.length - 1] as number) + step <= max) return null;
    return step;
}

function isContiguous(list: number[]): boolean {
    if (list.length < 2) return false;
    for (let i = 1; i < list.length; i += 1) {
        if ((list[i] as number) !== (list[i - 1] as number) + 1) return false;
    }
    return true;
}

function clockTimes(schedule: CronSchedule): string[] {
    const times: string[] = [];
    for (const hour of schedule.hour) {
        for (const minute of schedule.minute) {
            for (const second of schedule.second) {
                times.push(
                    schedule.hasSeconds
                        ? `${pad(hour)}:${pad(minute)}:${pad(second)}`
                        : `${pad(hour)}:${pad(minute)}`
                );
            }
        }
    }
    return times;
}

function timePhrase(schedule: CronSchedule): string {
    const everyHour = schedule.hour.length === 24;
    const everyMinute = schedule.minute.length === 60;
    const everySecond = schedule.hasSeconds && schedule.second.length === 60;
    const secondStep = schedule.hasSeconds ? stepOf(schedule.second, 0, 59) : null;
    const minuteStep = stepOf(schedule.minute, 0, 59);
    const hourStep = stepOf(schedule.hour, 0, 23);
    const onlySecond = schedule.second.length === 1 ? (schedule.second[0] as number) : null;
    const onlyMinute = schedule.minute.length === 1 ? (schedule.minute[0] as number) : null;

    if (everyHour && everyMinute) {
        if (everySecond) return 'every second';
        if (secondStep !== null) return `every ${secondStep} seconds`;
        if (onlySecond !== null && onlySecond !== 0) return `every minute at second ${onlySecond}`;
        return 'every minute';
    }

    if (everySecond || secondStep !== null) {
        const every = everySecond ? 'every second' : `every ${secondStep as number} seconds`;
        if (everyHour && minuteStep !== null) return `${every} of every ${minuteStep}th minute`;
        return `${every} of ${join(clockTimes({ ...schedule, second: [0] }).map(t => t.slice(0, 5)))}`;
    }

    if (everyHour) {
        if (minuteStep !== null) return `every ${minuteStep} minutes`;
        return `at minute ${join(schedule.minute.map(String))} of every hour`;
    }

    if (everyMinute) {
        return `every minute past hour ${join(schedule.hour.map(String))}`;
    }

    if (hourStep !== null && onlyMinute !== null) {
        return onlyMinute === 0
            ? `every ${hourStep} hours`
            : `every ${hourStep} hours at minute ${onlyMinute}`;
    }

    const times = clockTimes(schedule);
    if (times.length <= 8) return `at ${join(times)}`;
    return `at minute ${join(schedule.minute.map(String))} past hour ${join(schedule.hour.map(String))}`;
}

function domPhrase(dom: DomField): string {
    const parts: string[] = [];

    if (dom.days.length > 0 && dom.days.length < 31) {
        const step = stepOf(dom.days, 1, 31);
        parts.push(step !== null ? `every ${step} days` : `on the ${join(dom.days.map(ordinal))}`);
    }
    for (const offset of dom.lastOffsets) {
        parts.push(
            offset === 0
                ? 'on the last day of the month'
                : `on the day ${offset} ${offset === 1 ? 'day' : 'days'} before the end of the month`
        );
    }
    for (const day of dom.nearestWeekday) {
        parts.push(`on the weekday nearest the ${ordinal(day)}`);
    }
    if (dom.lastWeekday) parts.push('on the last weekday of the month');

    return join(parts, 'or');
}

function dowPhrase(dow: DowField): string {
    const parts: string[] = [];

    if (dow.days.length > 0 && dow.days.length < 7) {
        const names = dow.days.map(day => DAY_NAMES[day] as string);
        if (dow.days.join() === '1,2,3,4,5') parts.push('on weekdays');
        else if (dow.days.join() === '0,6') parts.push('on weekends');
        else if (isContiguous(dow.days))
            parts.push(`from ${names[0] as string} through ${names[names.length - 1] as string}`);
        else parts.push(`on ${join(names)}`);
    }
    for (const entry of dow.nth) {
        parts.push(
            `on the ${NTH_WORDS[entry.nth] ?? ordinal(entry.nth)} ${DAY_NAMES[entry.day] as string} of the month`
        );
    }
    for (const day of dow.last) {
        parts.push(`on the last ${DAY_NAMES[day] as string} of the month`);
    }

    return join(parts, 'or');
}

function monthPhrase(months: number[]): string {
    if (months.length === 12) return '';
    const names = months.map(month => MONTH_NAMES[month - 1] as string);
    if (isContiguous(months)) {
        return `in ${names[0] as string} through ${names[names.length - 1] as string}`;
    }
    return `in ${join(names)}`;
}

export function describeCron(schedule: CronSchedule, options: DescribeOptions = {}): string {
    const time = timePhrase(schedule);
    const dom = domPhrase(schedule.dom);
    const dow = dowPhrase(schedule.dow);
    const month = monthPhrase(schedule.month);

    const bothRestricted = schedule.dom.restricted && schedule.dow.restricted;
    const connector = bothRestricted && schedule.domDowMode === 'or' ? 'or' : 'and';

    let days = dom !== '' && dow !== '' ? `${dom} ${connector} ${dow}` : dom !== '' ? dom : dow;
    if (days === '' && /^at \d/.test(time)) days = 'every day';

    const sentence = [time, days, month].filter(part => part !== '').join(', ');
    return options.tz === undefined ? sentence : `${sentence} (${options.tz})`;
}
