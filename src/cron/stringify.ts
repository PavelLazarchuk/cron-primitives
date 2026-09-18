import type { CronSchedule, DomField, DowField } from '../core/types';
import { parseCron, type ParseOptions } from './parse';

export interface StringifyOptions {
    seconds?: boolean;
    macros?: boolean;
}

const MACROS: Record<string, string> = {
    '0 0 1 1 *': '@yearly',
    '0 0 1 * *': '@monthly',
    '0 0 * * 0': '@weekly',
    '0 0 * * *': '@daily',
    '0 * * * *': '@hourly',
};

function ordered(values: readonly number[] | undefined): number[] {
    return values ? [...new Set(values)].sort((a, b) => a - b) : [];
}

function runs(values: readonly number[]): string {
    const terms: string[] = [];

    for (let i = 0; i < values.length;) {
        let end = i;

        while (
            end + 1 < values.length &&
            (values[end + 1] as number) === (values[end] as number) + 1
        )
            end += 1;

        if (end - i >= 2) terms.push(`${values[i]}-${values[end]}`);
        else for (let k = i; k <= end; k += 1) terms.push(String(values[k]));

        i = end + 1;
    }

    return terms.join(',');
}

function list(values: readonly number[], min: number, max: number, star = true): string {
    if (values.length === 0) return '';
    if (values.length === max - min + 1) return star ? '*' : `${min}-${max}`;

    const first = values[0] as number;
    const last = values[values.length - 1] as number;
    const candidates: string[] = [];

    if (values.length >= 2) {
        const step = (values[1] as number) - first;
        let even = step > 1;

        for (let i = 1; even && i < values.length; i += 1)
            even = (values[i] as number) - (values[i - 1] as number) === step;

        if (even && last + step > max)
            candidates.push(star && first === min ? `*/${step}` : `${first}-${last}/${step}`);
    }

    candidates.push(runs(values));

    return candidates.reduce((best, term) => (term.length < best.length ? term : best));
}

function dayOfMonth(dom: DomField): string {
    const terms: string[] = [];
    const days = ordered(dom.days);

    if (days.length) terms.push(list(days, 1, 31, !dom.restricted));

    for (const offset of ordered(dom.lastOffsets)) terms.push(offset === 0 ? 'L' : `L-${offset}`);
    for (const day of ordered(dom.nearestWeekday)) terms.push(`${day}W`);
    if (dom.lastWeekday) terms.push('LW');

    return terms.length ? terms.join(',') : '*';
}

function dayOfWeek(dow: DowField): string {
    const terms: string[] = [];
    const days = ordered(dow.days);

    if (days.length) terms.push(list(days, 0, 6, !dow.restricted));

    for (const day of ordered(dow.last)) terms.push(`${day}L`);

    const nth = [...(dow.nth ?? [])].sort((a, b) => a.day - b.day || a.nth - b.nth);

    for (const { day, nth: week } of nth) terms.push(`${day}#${week}`);

    return terms.length ? terms.join(',') : '*';
}

function needsSeconds(second: readonly number[]): boolean {
    return !(second.length === 1 && second[0] === 0);
}

export function stringify(schedule: CronSchedule, options: StringifyOptions = {}): string {
    if (schedule.reboot) return '@reboot';

    const second = ordered(schedule.second);
    const year = ordered(schedule.year);

    const withSeconds = needsSeconds(second) || (options.seconds ?? schedule.hasSeconds);

    const fields = [
        list(ordered(schedule.minute), 0, 59),
        list(ordered(schedule.hour), 0, 23),
        dayOfMonth(schedule.dom),
        list(ordered(schedule.month), 1, 12),
        dayOfWeek(schedule.dow),
    ];

    const body = fields.join(' ');

    if (!withSeconds && !year.length && options.macros) {
        const macro = MACROS[body];

        if (macro !== undefined) return macro;
    }

    const head = withSeconds ? `${list(second, 0, 59)} ${body}` : body;

    return year.length ? `${head} ${list(year, 1970, 2099)}` : head;
}

function toSchedule(value: CronSchedule | string, options?: ParseOptions): CronSchedule {
    return typeof value === 'string' ? parseCron(value, options) : value;
}

export function equals(
    a: CronSchedule | string,
    b: CronSchedule | string,
    options?: ParseOptions
): boolean {
    const left = toSchedule(a, options);
    const right = toSchedule(b, options);

    if (left.domDowMode !== right.domDowMode) return false;

    return stringify(left, { seconds: false }) === stringify(right, { seconds: false });
}
