import type { CronSchedule, DomField, DowField } from '../core/types';

/**
 * Every word `describeCron` can say, so another language is a dictionary rather
 * than a fork. Anything that varies between languages is a function: the pieces
 * arrive already rendered by this same dictionary, so overriding `ordinal` or
 * `list` alone reaches every sentence that uses one.
 */
export interface DescribeStrings {
    dayNames: readonly string[];
    monthNames: readonly string[];
    ordinal: (value: number) => string;
    nthWord: (value: number) => string;
    list: (items: readonly string[], conjunction: 'and' | 'or') => string;
    clock: (hour: number, minute: number, second?: number) => string;

    everySecond: string;
    everyNSeconds: (step: number) => string;
    everyMinute: string;
    everyMinuteAtSecond: (second: number) => string;
    everyNMinutes: (step: number) => string;
    everyNHours: (step: number, minute: number) => string;
    atMinutesOfEveryHour: (minutes: string) => string;
    everyMinutePastHours: (hours: string) => string;
    atTimes: (times: string) => string;
    atMinutesPastHours: (minutes: string, hours: string) => string;
    secondsOfEveryNthMinute: (seconds: string, step: number) => string;
    secondsOfTimes: (seconds: string, times: string) => string;

    everyNDays: (step: number) => string;
    onDaysOfMonth: (days: string) => string;
    onLastDayOfMonth: string;
    onDaysBeforeEndOfMonth: (offset: number) => string;
    onWeekdayNearest: (day: string) => string;
    onLastWeekdayOfMonth: string;

    onWeekdays: string;
    onWeekends: string;
    onDayNamesThrough: (first: string, last: string) => string;
    onDayNames: (days: string) => string;
    onNthDayNameOfMonth: (nth: string, day: string) => string;
    onLastDayNameOfMonth: (day: string) => string;

    inMonths: (months: string) => string;
    inMonthsThrough: (first: string, last: string) => string;

    inYears: (years: string) => string;
    inYearsThrough: (first: number, last: number) => string;

    atStartup: string;

    everyDay: string;
    bothDayFields: (dom: string, dow: string, mode: 'and' | 'or') => string;
    sentence: (parts: { time: string; days: string; months: string; years: string }) => string;
    inZone: (sentence: string, tz: string) => string;
}

export interface DescribeOptions {
    tz?: string;
    /** Overrides on top of {@link englishStrings} — a word, or the whole language. */
    strings?: Partial<DescribeStrings>;
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

export const englishStrings: DescribeStrings = {
    dayNames: DAY_NAMES,
    monthNames: MONTH_NAMES,
    ordinal,
    nthWord: value => NTH_WORDS[value] ?? ordinal(value),
    list: (items, conjunction) => {
        if (items.length === 0) return '';
        if (items.length === 1) return items[0] as string;
        return `${items.slice(0, -1).join(', ')} ${conjunction} ${items[items.length - 1] as string}`;
    },
    clock: (hour, minute, second) =>
        second === undefined
            ? `${pad(hour)}:${pad(minute)}`
            : `${pad(hour)}:${pad(minute)}:${pad(second)}`,

    everySecond: 'every second',
    everyNSeconds: step => `every ${step} seconds`,
    everyMinute: 'every minute',
    everyMinuteAtSecond: second => `every minute at second ${second}`,
    everyNMinutes: step => `every ${step} minutes`,
    everyNHours: (step, minute) =>
        minute === 0 ? `every ${step} hours` : `every ${step} hours at minute ${minute}`,
    atMinutesOfEveryHour: minutes => `at minute ${minutes} of every hour`,
    everyMinutePastHours: hours => `every minute past hour ${hours}`,
    atTimes: times => `at ${times}`,
    atMinutesPastHours: (minutes, hours) => `at minute ${minutes} past hour ${hours}`,
    secondsOfEveryNthMinute: (seconds, step) => `${seconds} of every ${step}th minute`,
    secondsOfTimes: (seconds, times) => `${seconds} of ${times}`,

    everyNDays: step => `every ${step} days`,
    onDaysOfMonth: days => `on the ${days}`,
    onLastDayOfMonth: 'on the last day of the month',
    onDaysBeforeEndOfMonth: offset =>
        `on the day ${offset} ${offset === 1 ? 'day' : 'days'} before the end of the month`,
    onWeekdayNearest: day => `on the weekday nearest the ${day}`,
    onLastWeekdayOfMonth: 'on the last weekday of the month',

    onWeekdays: 'on weekdays',
    onWeekends: 'on weekends',
    onDayNamesThrough: (first, last) => `from ${first} through ${last}`,
    onDayNames: days => `on ${days}`,
    onNthDayNameOfMonth: (nth, day) => `on the ${nth} ${day} of the month`,
    onLastDayNameOfMonth: day => `on the last ${day} of the month`,

    inMonths: months => `in ${months}`,
    inMonthsThrough: (first, last) => `in ${first} through ${last}`,

    inYears: years => `in ${years}`,
    inYearsThrough: (first, last) => `from ${first} through ${last}`,

    atStartup: 'at startup',

    everyDay: 'every day',
    bothDayFields: (dom, dow, mode) => `${dom} ${mode} ${dow}`,
    sentence: parts =>
        [parts.time, parts.days, parts.months, parts.years].filter(part => part !== '').join(', '),
    inZone: (sentence, tz) => `${sentence} (${tz})`,
};

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

function clockTimes(schedule: CronSchedule, s: DescribeStrings, withSeconds: boolean): string[] {
    const times: string[] = [];
    for (const hour of schedule.hour) {
        for (const minute of schedule.minute) {
            if (!withSeconds) {
                times.push(s.clock(hour, minute));
                continue;
            }
            for (const second of schedule.second) times.push(s.clock(hour, minute, second));
        }
    }
    return times;
}

/**
 * The phrase, and whether it named clock times — which is what decides between
 * "at 09:00, every day" and a phrase that already implies its own days.
 */
function timePhrase(
    schedule: CronSchedule,
    s: DescribeStrings
): { text: string; isClockTime: boolean } {
    const plain = (text: string): { text: string; isClockTime: boolean } => ({
        text,
        isClockTime: false,
    });

    const everyHour = schedule.hour.length === 24;
    const everyMinute = schedule.minute.length === 60;
    const everySecond = schedule.hasSeconds && schedule.second.length === 60;
    const secondStep = schedule.hasSeconds ? stepOf(schedule.second, 0, 59) : null;
    const minuteStep = stepOf(schedule.minute, 0, 59);
    const hourStep = stepOf(schedule.hour, 0, 23);
    const onlySecond = schedule.second.length === 1 ? (schedule.second[0] as number) : null;
    const onlyMinute = schedule.minute.length === 1 ? (schedule.minute[0] as number) : null;

    if (everyHour && everyMinute) {
        if (everySecond) return plain(s.everySecond);
        if (secondStep !== null) return plain(s.everyNSeconds(secondStep));
        if (onlySecond !== null && onlySecond !== 0) {
            return plain(s.everyMinuteAtSecond(onlySecond));
        }
        return plain(s.everyMinute);
    }

    if (everySecond || secondStep !== null) {
        const every = everySecond ? s.everySecond : s.everyNSeconds(secondStep as number);
        if (everyHour && minuteStep !== null) {
            return plain(s.secondsOfEveryNthMinute(every, minuteStep));
        }
        return plain(s.secondsOfTimes(every, s.list(clockTimes(schedule, s, false), 'and')));
    }

    if (everyHour) {
        if (minuteStep !== null) return plain(s.everyNMinutes(minuteStep));
        return plain(s.atMinutesOfEveryHour(s.list(schedule.minute.map(String), 'and')));
    }

    if (everyMinute) {
        return plain(s.everyMinutePastHours(s.list(schedule.hour.map(String), 'and')));
    }

    if (hourStep !== null && onlyMinute !== null) {
        return plain(s.everyNHours(hourStep, onlyMinute));
    }

    const times = clockTimes(schedule, s, schedule.hasSeconds);
    if (times.length <= 8) return { text: s.atTimes(s.list(times, 'and')), isClockTime: true };
    return plain(
        s.atMinutesPastHours(
            s.list(schedule.minute.map(String), 'and'),
            s.list(schedule.hour.map(String), 'and')
        )
    );
}

function domPhrase(dom: DomField, s: DescribeStrings): string {
    const parts: string[] = [];

    if (dom.days.length > 0 && dom.days.length < 31) {
        const step = stepOf(dom.days, 1, 31);
        parts.push(
            step !== null
                ? s.everyNDays(step)
                : s.onDaysOfMonth(s.list(dom.days.map(s.ordinal), 'and'))
        );
    }
    for (const offset of dom.lastOffsets) {
        parts.push(offset === 0 ? s.onLastDayOfMonth : s.onDaysBeforeEndOfMonth(offset));
    }
    for (const day of dom.nearestWeekday) {
        parts.push(s.onWeekdayNearest(s.ordinal(day)));
    }
    if (dom.lastWeekday) parts.push(s.onLastWeekdayOfMonth);

    return s.list(parts, 'or');
}

function dowPhrase(dow: DowField, s: DescribeStrings): string {
    const parts: string[] = [];

    if (dow.days.length > 0 && dow.days.length < 7) {
        const names = dow.days.map(day => s.dayNames[day] as string);
        if (dow.days.join() === '1,2,3,4,5') parts.push(s.onWeekdays);
        else if (dow.days.join() === '0,6') parts.push(s.onWeekends);
        else if (isContiguous(dow.days))
            parts.push(s.onDayNamesThrough(names[0] as string, names[names.length - 1] as string));
        else parts.push(s.onDayNames(s.list(names, 'and')));
    }
    for (const entry of dow.nth) {
        parts.push(s.onNthDayNameOfMonth(s.nthWord(entry.nth), s.dayNames[entry.day] as string));
    }
    for (const day of dow.last) {
        parts.push(s.onLastDayNameOfMonth(s.dayNames[day] as string));
    }

    return s.list(parts, 'or');
}

function monthPhrase(months: number[], s: DescribeStrings): string {
    if (months.length === 12) return '';
    const names = months.map(month => s.monthNames[month - 1] as string);
    if (isContiguous(months)) {
        return s.inMonthsThrough(names[0] as string, names[names.length - 1] as string);
    }
    return s.inMonths(s.list(names, 'and'));
}

function yearPhrase(years: number[] | undefined, s: DescribeStrings): string {
    if (years === undefined || years.length === 0) return '';
    if (years.length > 1 && isContiguous(years)) {
        return s.inYearsThrough(years[0] as number, years[years.length - 1] as number);
    }
    return s.inYears(s.list(years.map(String), 'and'));
}

export function describeCron(schedule: CronSchedule, options: DescribeOptions = {}): string {
    const s =
        options.strings === undefined ? englishStrings : { ...englishStrings, ...options.strings };

    if (schedule.reboot === true) return s.atStartup;

    const time = timePhrase(schedule, s);
    const dom = domPhrase(schedule.dom, s);
    const dow = dowPhrase(schedule.dow, s);
    const months = monthPhrase(schedule.month, s);
    const years = yearPhrase(schedule.year, s);

    const bothRestricted = schedule.dom.restricted && schedule.dow.restricted;
    const mode = bothRestricted && schedule.domDowMode === 'or' ? 'or' : 'and';

    let days = dom !== '' && dow !== '' ? s.bothDayFields(dom, dow, mode) : dom !== '' ? dom : dow;
    if (days === '' && time.isClockTime) days = s.everyDay;

    const sentence = s.sentence({ time: time.text, days, months, years });
    return options.tz === undefined ? sentence : s.inZone(sentence, options.tz);
}
