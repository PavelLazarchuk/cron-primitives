import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const load = specifier => import(new URL(specifier, import.meta.url).href);

const [major] = process.versions.node.split('.').map(Number);
assert.ok(major >= 18, `expected Node >= 18, got ${process.versions.node}`);

const { parseCron, safeParseCron, next, nextN, prev, matches, occurrences, dueSince, isDue } =
    await load('../dist/index.js');
const { offsetAt, epochFromWall } = await load('../dist/tz/index.js');
const { describeCron } = await load('../dist/describe/index.js');
const { scheduleCron } = await load('../dist/schedule/index.js');

const iso = instant => new Date(instant).toISOString();
const at = text => Date.parse(text);

const weekdayMornings = parseCron('0 9 * * 1-5');
const revived = JSON.parse(JSON.stringify(weekdayMornings));
assert.deepEqual(revived, weekdayMornings, 'schedule did not survive JSON');

assert.equal(iso(next(revived, at('2026-01-01T00:00:00Z'))), '2026-01-01T09:00:00.000Z');
assert.deepEqual(
    nextN(revived, at('2026-01-01T00:00:00Z'), 3).map(iso),
    ['2026-01-01T09:00:00.000Z', '2026-01-02T09:00:00.000Z', '2026-01-05T09:00:00.000Z'],
    'weekends leaked into a weekday schedule'
);
assert.equal(iso(prev(revived, at('2026-01-05T09:00:00Z'))), '2026-01-02T09:00:00.000Z');
assert.equal(matches(revived, at('2026-01-01T09:00:00Z')), true);
assert.equal(matches(revived, at('2026-01-03T09:00:00Z')), false);
assert.equal(next(parseCron('0 0 30 2 *'), 0), null, 'February 30th came around');

const window = [
    ...occurrences(parseCron('0 * * * *'), {
        from: at('2026-01-01T00:00:00Z'),
        to: at('2026-01-01T03:00:00Z'),
    }),
];
assert.equal(window.length, 3, 'occurrences ignored its range');

const outage = dueSince(
    parseCron('0 * * * *'),
    { lastRunAt: at('2026-01-01T00:00:00Z') },
    at('2026-01-01T05:30:00Z')
);
assert.equal(outage.due.length, 5, 'missed runs were not recovered');
assert.equal(iso(outage.state.lastRunAt), '2026-01-01T05:00:00.000Z');
assert.equal(
    dueSince(parseCron('0 * * * *'), outage.state, at('2026-01-01T05:30:00Z')).due.length,
    0,
    'catch-up is not idempotent'
);
assert.equal(isDue(parseCron('0 * * * *'), outage.state, at('2026-01-01T06:00:00Z')), true);

assert.equal(describeCron(weekdayMornings), 'at 09:00, on weekdays');
assert.equal(safeParseCron('0 0 * * 9').ok, false, 'a bad expression parsed');

const hasFullIcu = (() => {
    try {
        return offsetAt('America/New_York', at('2026-01-15T12:00:00Z')) === -300;
    } catch {
        return false;
    }
})();

if (hasFullIcu) {
    assert.equal(offsetAt('Asia/Kathmandu', at('2026-06-15T12:00:00Z')), 345);

    const deleted = epochFromWall('America/New_York', {
        year: 2026,
        month: 3,
        day: 8,
        hour: 2,
        minute: 30,
        second: 0,
    });
    assert.equal(deleted.kind, 'gap');
    assert.equal(iso(deleted.gapEndsAt), '2026-03-08T07:00:00.000Z');

    const daily = parseCron('30 2 * * *');
    assert.equal(
        iso(next(daily, at('2026-03-07T12:00:00Z'), { tz: 'America/New_York' })),
        '2026-03-08T07:00:00.000Z',
        'a deleted wall-clock time was not shifted past the gap'
    );
    assert.equal(
        iso(
            next(daily, at('2026-03-07T12:00:00Z'), { tz: 'America/New_York', nonexistent: 'skip' })
        ),
        '2026-03-09T06:30:00.000Z'
    );

    const nightly = parseCron('30 1 * * *');
    assert.equal(
        iso(next(nightly, at('2026-11-01T04:00:00Z'), { tz: 'America/New_York' })),
        '2026-11-01T05:30:00.000Z',
        'a duplicated wall-clock time picked the wrong pass'
    );
    assert.equal(
        iso(
            next(nightly, at('2026-11-01T05:30:00Z'), {
                tz: 'America/New_York',
                ambiguous: 'both',
            })
        ),
        '2026-11-01T06:30:00.000Z'
    );
} else {
    console.log('smoke: small-icu build — zone assertions skipped');
}

let firedAt = 0;
let clock = at('2026-01-01T00:00:00Z');
const queue = [];
const runner = scheduleCron(parseCron('0 * * * *'), instant => (firedAt = instant), {
    now: () => clock,
    setTimer: (callback, delay) => queue.push({ fireAt: clock + delay, callback }) - 1,
    clearTimer: () => queue.splice(0, queue.length),
});
assert.equal(iso(runner.nextAt()), '2026-01-01T01:00:00.000Z');
const armed = queue.shift();
clock = armed.fireAt;
armed.callback();
assert.equal(iso(firedAt), '2026-01-01T01:00:00.000Z', 'the handler got the wrong instant');
runner.stop();
assert.equal(runner.nextAt(), null);

const cjs = require('../dist/index.cjs');
assert.equal(typeof cjs.parseCron, 'function');
assert.equal(typeof cjs.dueSince, 'function');
assert.equal(typeof require('../dist/tz/index.cjs').offsetAt, 'function');
assert.equal(typeof require('../dist/describe/index.cjs').describeCron, 'function');
assert.equal(typeof require('../dist/schedule/index.cjs').scheduleCron, 'function');
assert.equal(typeof require('../dist/cron/index.cjs').parseCron, 'function');
assert.deepEqual(
    Object.keys(cjs).sort(),
    Object.keys(await load('../dist/index.js')).sort(),
    'CJS and ESM entry points disagree'
);

console.log(`smoke: ok on Node ${process.versions.node}`);
