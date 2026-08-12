import { parseCron, next, nextN } from '../dist/index.js';
import { clearTimeZoneCache } from '../dist/tz/index.js';

const T0 = Date.parse('2026-06-15T12:00:00Z');

function bench(label, iterations, fn) {
    fn(0);
    const started = process.hrtime.bigint();
    for (let i = 0; i < iterations; i += 1) fn(i);
    const nanos = Number(process.hrtime.bigint() - started) / iterations;
    console.log(`${label.padEnd(46)} ${(nanos / 1000).toFixed(2).padStart(8)} µs`);
}

const cases = [
    ['*/15 * * * *', 'UTC'],
    ['*/15 * * * *', 'America/New_York'],
    ['30 9 * * 1-5', 'UTC'],
    ['30 9 * * 1-5', 'America/New_York'],
    ['30 9 * * 1-5', 'Australia/Lord_Howe'],
    ['0 0 L * *', 'Europe/Warsaw'],
    ['0 12 29 2 *', 'America/New_York'],
];

for (const [expression, tz] of cases) {
    const schedule = parseCron(expression);
    bench(`next  ${expression.padEnd(14)} ${tz}`, 20_000, i =>
        next(schedule, T0 + i * 1000, { tz })
    );
}

bench('parseCron 0 9 * * 1-5', 50_000, () => parseCron('0 9 * * 1-5'));

const schedule = parseCron('*/5 * * * *');
bench('nextN 100 across a DST transition', 200, () =>
    nextN(schedule, Date.parse('2026-11-01T04:00:00Z'), 100, { tz: 'America/New_York' })
);

clearTimeZoneCache();
bench('next with a cold zone cache', 2_000, i => {
    clearTimeZoneCache();
    return next(schedule, T0 + i * 1000, { tz: 'America/New_York' });
});
