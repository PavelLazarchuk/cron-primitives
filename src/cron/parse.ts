import { CronSyntaxError, type CronFieldName } from '../core/errors';
import type { CronSchedule, DomField, DowField } from '../core/types';

export interface ParseOptions {
    seconds?: boolean;
    domDowMode?: 'or' | 'and';
}

interface FieldDef {
    name: CronFieldName;
    min: number;
    max: number;
    names?: Record<string, number>;
    wraps?: boolean;
}

const MONTHS: Record<string, number> = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
};

const WEEKDAYS: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
};

const SECOND: FieldDef = { name: 'second', min: 0, max: 59 };
const MINUTE: FieldDef = { name: 'minute', min: 0, max: 59 };
const HOUR: FieldDef = { name: 'hour', min: 0, max: 23 };
const DOM: FieldDef = { name: 'dayOfMonth', min: 1, max: 31 };
const MONTH: FieldDef = { name: 'month', min: 1, max: 12, names: MONTHS };
const DOW: FieldDef = { name: 'dayOfWeek', min: 0, max: 7, names: WEEKDAYS, wraps: true };

const MACROS: Record<string, string> = {
    '@yearly': '0 0 1 1 *',
    '@annually': '0 0 1 1 *',
    '@monthly': '0 0 1 * *',
    '@weekly': '0 0 * * 0',
    '@daily': '0 0 * * *',
    '@midnight': '0 0 * * *',
    '@hourly': '0 * * * *',
};

interface Ctx {
    source: string;
    field: CronFieldName;
    index: number;
}

function fail(ctx: Ctx, message: string): never {
    throw new CronSyntaxError(`${message} in ${ctx.field} field of ${JSON.stringify(ctx.source)}`, {
        source: ctx.source,
        field: ctx.field,
        index: ctx.index,
    });
}

function toValue(token: string, def: FieldDef, ctx: Ctx): number {
    const named = def.names?.[token.toLowerCase()];
    if (named !== undefined) return named;

    if (!/^\d{1,2}$/.test(token)) fail(ctx, `unexpected ${JSON.stringify(token)}`);
    const value = Number(token);
    if (value < def.min || value > def.max) {
        fail(ctx, `${value} is out of range ${def.min}-${def.max}`);
    }
    return value;
}

function normalize(value: number, def: FieldDef): number {
    return def.name === 'dayOfWeek' ? value % 7 : value;
}

function toStep(token: string, def: FieldDef, ctx: Ctx): number {
    if (!/^\d{1,3}$/.test(token) || Number(token) < 1) {
        fail(ctx, `step must be a positive integer, received ${JSON.stringify(token)}`);
    }
    const step = Number(token);
    if (step > def.max - def.min + 1) fail(ctx, `step ${step} is larger than the field`);
    return step;
}

function expand(term: string, def: FieldDef, ctx: Ctx): number[] {
    const [base, stepToken, ...rest] = term.split('/');
    if (rest.length > 0 || base === undefined) fail(ctx, `unexpected ${JSON.stringify(term)}`);
    const step = stepToken === undefined ? 1 : toStep(stepToken, def, ctx);

    const ceiling = def.name === 'dayOfWeek' ? 6 : def.max;

    let from: number;
    let to: number;
    if (base === '*' || base === '?') {
        from = def.min;
        to = ceiling;
    } else if (base.includes('-')) {
        const [startToken, endToken, ...extra] = base.split('-');
        if (extra.length > 0 || startToken === undefined || endToken === undefined) {
            fail(ctx, `unexpected ${JSON.stringify(term)}`);
        }
        from = toValue(startToken, def, ctx);
        to = toValue(endToken, def, ctx);
    } else {
        from = toValue(base, def, ctx);
        to = stepToken === undefined ? from : ceiling;
    }

    const values: number[] = [];

    if (from <= to) {
        for (let value = from; value <= to; value += step) values.push(normalize(value, def));
        return values;
    }

    if (!def.wraps) fail(ctx, `range ${from}-${to} runs backwards`);

    const span = ceiling - def.min + 1;
    const start = normalize(from, def);
    const length = (((normalize(to, def) - start) % span) + span) % span;
    for (let i = 0; i <= length; i += step) values.push(def.min + ((start - def.min + i) % span));
    return values;
}

function parseList(text: string, def: FieldDef, ctx: Ctx): number[] {
    const seen = new Set<number>();
    for (const term of text.split(',')) {
        if (term === '') fail(ctx, 'empty term');
        for (const value of expand(term, def, ctx)) seen.add(value);
    }
    return [...seen].sort((a, b) => a - b);
}

function isStar(text: string): boolean {
    return text === '*' || text === '?' || text.startsWith('*/');
}

function parseDom(text: string, ctx: Ctx): DomField {
    const days = new Set<number>();
    const lastOffsets = new Set<number>();
    const nearestWeekday = new Set<number>();
    let lastWeekday = false;

    for (const term of text.split(',')) {
        const upper = term.toUpperCase();
        if (term === '') fail(ctx, 'empty term');
        if (upper === 'L') {
            lastOffsets.add(0);
        } else if (upper === 'LW') {
            lastWeekday = true;
        } else if (/^L-\d{1,2}$/.test(upper)) {
            const offset = Number(upper.slice(2));
            if (offset > 30) fail(ctx, `L-${offset} reaches past the start of every month`);
            lastOffsets.add(offset);
        } else if (/^\d{1,2}W$/.test(upper)) {
            nearestWeekday.add(toValue(upper.slice(0, -1), DOM, ctx));
        } else {
            for (const value of expand(term, DOM, ctx)) days.add(value);
        }
    }

    return {
        days: [...days].sort((a, b) => a - b),
        lastOffsets: [...lastOffsets].sort((a, b) => a - b),
        nearestWeekday: [...nearestWeekday].sort((a, b) => a - b),
        lastWeekday,
        restricted: !isStar(text),
    };
}

function parseDow(text: string, ctx: Ctx): DowField {
    const days = new Set<number>();
    const nth: Array<{ day: number; nth: number }> = [];
    const last = new Set<number>();

    for (const term of text.split(',')) {
        const upper = term.toUpperCase();
        if (term === '') fail(ctx, 'empty term');
        if (/^(\d|SUN|MON|TUE|WED|THU|FRI|SAT)L$/.test(upper)) {
            last.add(normalize(toValue(upper.slice(0, -1), DOW, ctx), DOW));
        } else if (/^(\d|SUN|MON|TUE|WED|THU|FRI|SAT)#\d$/.test(upper)) {
            const [dayToken, nthToken] = upper.split('#') as [string, string];
            const week = Number(nthToken);
            if (week < 1 || week > 5) fail(ctx, `#${week} must be between 1 and 5`);
            nth.push({ day: normalize(toValue(dayToken, DOW, ctx), DOW), nth: week });
        } else {
            for (const value of expand(term, DOW, ctx)) days.add(value);
        }
    }

    return {
        days: [...days].sort((a, b) => a - b),
        nth,
        last: [...last].sort((a, b) => a - b),
        restricted: !isStar(text),
    };
}

/**
 * Compiles a cron expression into a plain, serializable schedule.
 *
 * Accepts the standard five fields, an optional leading seconds field, the
 * usual macros, and the Quartz modifiers `L`, `W`, `#` and `?`.
 *
 * @throws {CronSyntaxError} naming the field and the offset that failed.
 */
export function parseCron(expression: string, options: ParseOptions = {}): CronSchedule {
    if (typeof expression !== 'string') {
        throw new CronSyntaxError(`expression must be a string, received ${typeof expression}`, {
            source: String(expression),
        });
    }

    const source = expression.trim();
    if (source === '') {
        throw new CronSyntaxError('expression is empty', { source });
    }

    if (source.startsWith('@')) {
        const macro = MACROS[source.toLowerCase()];
        if (macro === undefined) {
            throw new CronSyntaxError(
                `unknown macro ${JSON.stringify(source)} — known macros are ${Object.keys(MACROS).join(', ')}`,
                { source, index: 0 }
            );
        }
        return parseCron(macro, { ...options, seconds: false });
    }

    const tokens: Array<{ text: string; index: number }> = [];
    const pattern = /\S+/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
        tokens.push({ text: match[0], index: match.index });
    }

    const wantsSeconds = options.seconds ?? tokens.length === 6;
    const expected = wantsSeconds ? 6 : 5;
    if (tokens.length !== expected) {
        throw new CronSyntaxError(
            `expected ${expected} fields, received ${tokens.length} in ${JSON.stringify(source)}`,
            { source }
        );
    }

    const at = (position: number, def: FieldDef): Ctx => ({
        source,
        field: def.name,
        index: (tokens[position] as { index: number }).index,
    });
    const text = (position: number): string => (tokens[position] as { text: string }).text;

    const offset = wantsSeconds ? 1 : 0;
    const second = wantsSeconds ? parseList(text(0), SECOND, at(0, SECOND)) : [0];

    return {
        kind: 'cron',
        second,
        minute: parseList(text(offset), MINUTE, at(offset, MINUTE)),
        hour: parseList(text(offset + 1), HOUR, at(offset + 1, HOUR)),
        dom: parseDom(text(offset + 2), at(offset + 2, DOM)),
        month: parseList(text(offset + 3), MONTH, at(offset + 3, MONTH)),
        dow: parseDow(text(offset + 4), at(offset + 4, DOW)),
        domDowMode: options.domDowMode ?? 'or',
        hasSeconds: wantsSeconds,
    };
}

export type ParseResult =
    { ok: true; schedule: CronSchedule } | { ok: false; error: CronSyntaxError };

/** `parseCron` for the places that would only wrap it in a try/catch — a form field, mostly. */
export function safeParseCron(expression: string, options: ParseOptions = {}): ParseResult {
    try {
        return { ok: true, schedule: parseCron(expression, options) };
    } catch (error) {
        if (error instanceof CronSyntaxError) return { ok: false, error };
        throw error;
    }
}
