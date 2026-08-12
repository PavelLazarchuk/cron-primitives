import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcRoot = fileURLToPath(new URL('..', import.meta.url));

function sources(dir: string): Array<[name: string, code: string]> {
    const root = join(srcRoot, dir);
    return readdirSync(root)
        .filter(file => file.endsWith('.ts') && !file.endsWith('.test.ts'))
        .map(file => [`${dir}/${file}`, readFileSync(join(root, file), 'utf8')]);
}

const core = [
    ...sources('core'),
    ...sources('cron'),
    ...sources('tz'),
    ...sources('catchup'),
    ...sources('describe'),
];

describe('purity of the core', () => {
    it('has files to check', () => {
        expect(core.length).toBeGreaterThanOrEqual(10);
    });

    it.each(core)('%s never reads a clock', (_name, code) => {
        expect(code).not.toMatch(/Date\.now|performance\.now/);
    });

    it.each(core)('%s never allocates a timer', (_name, code) => {
        expect(code).not.toMatch(/setTimeout|setInterval|queueMicrotask/);
    });

    it.each(core)('%s never imports a node builtin', (_name, code) => {
        expect(code).not.toMatch(/from '(node:|fs|path|crypto|events)/);
    });

    it.each(core)('%s stays synchronous', (_name, code) => {
        expect(code).not.toMatch(/\bawait |\bPromise[.<(]|async \(|async function/);
    });

    it.each(core)('%s reads dates in UTC only', (_name, code) => {
        expect(code).not.toMatch(
            /\.get(FullYear|Month|Date|Day|Hours|Minutes|Seconds|Milliseconds)\b/
        );
    });

    it.each(core)('%s does not lean on a reference implementation', (_name, code) => {
        expect(code).not.toMatch(/cron-parser|rrule|luxon|dayjs|date-fns/);
    });

    it('reads a clock in exactly one place', () => {
        const everything = [...core, ...sources('schedule')];
        const hits = everything.filter(([, code]) => code.includes('Date.now'));
        expect(hits.map(([name]) => name)).toEqual(['schedule/index.ts']);
    });

    it('touches ICU in exactly one place', () => {
        const hits = core.filter(([, code]) => code.includes('Intl.'));
        expect(hits.map(([name]) => name)).toEqual(['tz/zone.ts']);
    });
});
