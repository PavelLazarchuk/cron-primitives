import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as api from './index';
import { at, isoAll } from './testUtils';

describe('public surface', () => {
    it('exports what the README promises', () => {
        expect(Object.keys(api).sort()).toEqual([
            'CronSyntaxError',
            'dueSince',
            'isDue',
            'isInterval',
            'isReboot',
            'matches',
            'next',
            'nextN',
            'occurrences',
            'parseCron',
            'prev',
            'safeParseCron',
        ]);
    });

    it('runs the whole loop a caller would write', () => {
        const schedule = api.parseCron('0 9 * * 1-5');
        const options = { tz: 'Europe/Warsaw' };

        const stored = JSON.parse(JSON.stringify(schedule));
        const upcoming = api.next(stored, at('2026-01-01T00:00:00Z'), options);
        expect(isoAll([upcoming as number])).toEqual(['2026-01-01T08:00:00.000Z']);

        const { due, state } = api.dueSince(
            stored,
            { lastRunAt: at('2026-01-01T00:00:00Z') },
            at('2026-01-06T12:00:00Z'),
            options
        );
        expect(isoAll(due)).toEqual([
            '2026-01-01T08:00:00.000Z',
            '2026-01-02T08:00:00.000Z',
            '2026-01-05T08:00:00.000Z',
            '2026-01-06T08:00:00.000Z',
        ]);
        expect(api.isDue(stored, state, at('2026-01-06T12:00:00Z'), options)).toBe(false);
    });
});

interface Fixture {
    expression: string;
    tz: string;
    from: string;
    expected?: string[];
    unsupported?: string;
}

const { fixtures } = JSON.parse(
    readFileSync(new URL('./fixtures/cron-parser.json', import.meta.url), 'utf8')
) as { fixtures: Fixture[] };

describe('agreement with cron-parser', () => {
    it('has fixtures to check', () => {
        expect(fixtures.filter(fixture => fixture.expected !== undefined).length).toBeGreaterThan(
            80
        );
    });

    for (const fixture of fixtures) {
        if (fixture.expected === undefined) continue;
        it(`${fixture.expression} in ${fixture.tz} from ${fixture.from}`, () => {
            const schedule = api.parseCron(fixture.expression);
            const instants = api.nextN(
                schedule,
                at(fixture.from),
                (fixture.expected as string[]).length,
                { tz: fixture.tz }
            );
            expect(isoAll(instants)).toEqual(fixture.expected);
        });
    }

    it('parses the syntax the reference implementation rejects', () => {
        const unsupported = fixtures.filter(fixture => fixture.unsupported !== undefined);
        expect(unsupported.length).toBeGreaterThan(0);
        for (const fixture of unsupported) {
            expect(() => api.parseCron(fixture.expression)).not.toThrow();
        }
    });
});
