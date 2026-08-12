export function at(iso: string): number {
    const ms = Date.parse(iso);
    if (Number.isNaN(ms)) throw new Error(`testUtils: ${iso} is not a date`);
    return ms;
}

export function iso(instant: number | null): string | null {
    return instant === null ? null : new Date(instant).toISOString();
}

export function isoAll(instants: number[]): string[] {
    return instants.map(instant => new Date(instant).toISOString());
}

export interface OracleWall {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
    weekday: number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const formatters = new Map<string, Intl.DateTimeFormat>();

export function oracleWall(tz: string, instant: number): OracleWall {
    let formatter = formatters.get(tz);
    if (formatter === undefined) {
        formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            hourCycle: 'h23',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            weekday: 'short',
        });
        formatters.set(tz, formatter);
    }

    const wall: OracleWall = {
        year: 0,
        month: 0,
        day: 0,
        hour: 0,
        minute: 0,
        second: 0,
        weekday: 0,
    };
    for (const part of formatter.formatToParts(instant)) {
        if (part.type === 'year') wall.year = Number(part.value);
        else if (part.type === 'month') wall.month = Number(part.value);
        else if (part.type === 'day') wall.day = Number(part.value);
        else if (part.type === 'hour') wall.hour = Number(part.value) % 24;
        else if (part.type === 'minute') wall.minute = Number(part.value);
        else if (part.type === 'second') wall.second = Number(part.value);
        else if (part.type === 'weekday') wall.weekday = WEEKDAYS.indexOf(part.value);
    }
    return wall;
}
