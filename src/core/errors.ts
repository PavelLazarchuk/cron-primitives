export const PREFIX = 'cron-primitives';

export type CronFieldName = 'second' | 'minute' | 'hour' | 'dayOfMonth' | 'month' | 'dayOfWeek';

export class CronSyntaxError extends TypeError {
    readonly source: string;
    readonly field?: CronFieldName;
    readonly index?: number;

    constructor(
        message: string,
        details: { source: string; field?: CronFieldName; index?: number }
    ) {
        super(`${PREFIX}: ${message}`);
        this.name = 'CronSyntaxError';
        this.source = details.source;
        this.field = details.field;
        this.index = details.index;
    }
}

export function assertFinite(value: number, name: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError(
            `${PREFIX}: ${name} must be a finite number, received ${String(value)}`
        );
    }
    return value;
}

export function assertPositiveInt(value: number, name: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
        throw new TypeError(
            `${PREFIX}: ${name} must be an integer greater than 0, received ${String(value)}`
        );
    }
    return value;
}
