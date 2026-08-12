export interface WallInput {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
}

export interface Wall extends WallInput {
    weekday: number;
}

export interface DomField {
    days: number[];
    lastOffsets: number[];
    nearestWeekday: number[];
    lastWeekday: boolean;
    restricted: boolean;
}

export interface DowField {
    days: number[];
    nth: Array<{ day: number; nth: number }>;
    last: number[];
    restricted: boolean;
}

export interface CronSchedule {
    readonly kind: 'cron';
    second: number[];
    minute: number[];
    hour: number[];
    dom: DomField;
    month: number[];
    dow: DowField;
    domDowMode: 'or' | 'and';
    hasSeconds: boolean;
}

export type NonexistentPolicy = 'skip' | 'shiftForward' | 'throw';

export type AmbiguousPolicy = 'first' | 'second' | 'both';

export interface Options {
    tz?: string;
    nonexistent?: NonexistentPolicy;
    ambiguous?: AmbiguousPolicy;
    maxYears?: number;
}

export interface CatchUpState {
    lastRunAt: number;
}
