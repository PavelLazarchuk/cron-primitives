import { writeFileSync } from 'node:fs';
import { CronExpressionParser } from 'cron-parser';

const EXPRESSIONS = [
    '*/7 * * * *',
    '0 * * * *',
    '30 9 * * *',
    '0 9,17 * * 1-5',
    '*/5 9-17 * * *',
    '0 0 1,15 * *',
    '15 3 * * 6',
    '0 12 * 1,7 *',
    '0 0 29 2 *',
    '23 0-6/2 * * *',
    '0 0 L * *',
    '0 0 * * 5L',
    '0 0 * * 1#3',
    '0 0 15W * *',
    '0 0 13 * 5',
    '@daily',
    '@monthly',
];

const WINDOWS = [
    { tz: 'UTC', from: '2026-01-06T00:00:00Z' },
    { tz: 'UTC', from: '2026-07-15T13:47:11Z' },
    { tz: 'Europe/Warsaw', from: '2026-06-10T00:00:00Z' },
    { tz: 'America/New_York', from: '2026-01-20T05:30:00Z' },
    { tz: 'Asia/Kathmandu', from: '2026-05-01T00:00:00Z' },
    { tz: 'Australia/Sydney', from: '2026-06-01T00:00:00Z' },
];

const COUNT = 12;

const fixtures = [];
for (const { tz, from } of WINDOWS) {
    for (const expression of EXPRESSIONS) {
        let iterator;
        try {
            iterator = CronExpressionParser.parse(expression, { currentDate: new Date(from), tz });
        } catch (error) {
            fixtures.push({ expression, tz, from, unsupported: String(error.message) });
            continue;
        }

        const expected = [];
        for (let i = 0; i < COUNT; i += 1) {
            try {
                expected.push(iterator.next().toDate().toISOString());
            } catch {
                break;
            }
        }
        fixtures.push({ expression, tz, from, expected });
    }
}

const path = new URL('../src/fixtures/cron-parser.json', import.meta.url);
writeFileSync(
    path,
    `${JSON.stringify({ generatedBy: 'scripts/gen-fixtures.mjs', fixtures }, null, 4)}\n`
);
console.log(`wrote ${fixtures.length} fixtures to ${path.pathname}`);
