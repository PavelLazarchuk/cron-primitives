# cron-primitives

[![npm version](https://img.shields.io/npm/v/cron-primitives.svg)](https://www.npmjs.com/package/cron-primitives)
[![npm downloads](https://img.shields.io/npm/dm/cron-primitives.svg)](https://www.npmjs.com/package/cron-primitives)

Schedule **math**, not a scheduler.

Every other package in this space owns the loop: you hand it a function, it keeps a timer alive, it calls you back. That works right up until the schedule has to outlive the process — a Worker evicted after the response, a Lambda that froze, a `next_run_at` column, a Durable Object alarm, a queue coming back from a four-hour outage. That code does not want a loop. It wants one number.

This package ships the arithmetic and hands the answer back:

> A schedule is a plain JSON-serializable object. Every query is a pure synchronous function of `(schedule, instant)`. The package never reads the clock, never allocates a timer, and never performs I/O in its core. Time zones come from `Intl`.

- **Zero dependencies.** No polyfills, no `node:` imports in the core.
- **Edge-native.** Runs unchanged in Workers, Deno, Bun, browsers and Node >= 18.
- **5.5 kB gzipped** for everything; 2.7 kB if you only import `next`.
- **Serializable schedules.** Parse once, store the object, restore it after a restart.

```ts
import { parseCron, next } from 'cron-primitives';

const schedule = parseCron('30 9 * * 1-5'); // plain data — put it in a column
const upcoming = next(schedule, Date.now(), { tz: 'Europe/Warsaw' });
// → epoch ms of the next weekday 09:30 in Warsaw, or null if it never fires again
```

## Install

```sh
npm install cron-primitives
```

| Import                     | What you get                                                                        | Size (gzip) |
| -------------------------- | ----------------------------------------------------------------------------------- | ----------- |
| `cron-primitives`          | `parseCron`, `next`, `prev`, `nextN`, `occurrences`, `matches`, `dueSince`, `isDue` | 5.5 kB      |
| `cron-primitives/cron`     | the parser alone, for validating input                                              | 2.3 kB      |
| `cron-primitives/tz`       | `offsetAt`, `wallFromEpoch`, `epochFromWall`                                        | 1.1 kB      |
| `cron-primitives/describe` | a schedule in any language                                                          | 1.8 kB      |
| `cron-primitives/schedule` | the only module that touches a timer                                                | 3.6 kB      |

## The two things this is actually for

### What did I miss while I was down?

The state is one number, and it is yours. Store it in a column, a KV value, a field on the Durable Object — anywhere a number goes.

```ts
import { parseCron, dueSince } from 'cron-primitives';

const schedule = parseCron('0 * * * *');
const saved = await db.get('lastRunAt'); // 4 hours ago

const { state, due, truncated } = dueSince(schedule, { lastRunAt: saved }, Date.now(), {
    tz: 'Europe/Warsaw',
    maxCatchUp: 10,
});

for (const firedAt of due) await run(firedAt); // 4 missed hours, oldest first
await db.set('lastRunAt', state.lastRunAt); // draining twice owes nothing
```

`due` holds at most `maxCatchUp` occurrences — the **most recent** ones. `truncated` says older ones were dropped, because a minutely job that was down for a week has ten thousand of them and running ten thousand of anything on restart is a second outage.

It is a flag rather than a count on purpose: counting the dropped occurrences is unbounded work, and this function does no unbounded work.

### What happens on the day the clock moves?

Twice a year a wall-clock time either does not exist or happens twice, and every scheduler has to pick a side. Here the choice has a name, a default, and a test.

```ts
const nightly = parseCron('30 2 * * *');
const tz = 'America/New_York';

// 2026-03-08: New York goes 01:59 EST → 03:00 EDT. 02:30 never happens.
next(nightly, springForwardEve, { tz });
// → 2026-03-08T07:00:00Z — the first instant after the gap (default)
next(nightly, springForwardEve, { tz, nonexistent: 'skip' });
// → 2026-03-09T06:30:00Z — nothing runs that day
next(nightly, springForwardEve, { tz, nonexistent: 'throw' });
// → RangeError: 2026-03-08T02:30:00 does not exist in America/New_York
```

| Option        | Values                                    | Default for a wall-clock time | Default for an interval |
| ------------- | ----------------------------------------- | ----------------------------- | ----------------------- |
| `nonexistent` | `'shiftForward'` \| `'skip'` \| `'throw'` | `'shiftForward'`              | `'skip'`                |
| `ambiguous`   | `'first'` \| `'second'` \| `'both'`       | `'first'`                     | `'both'`                |

The two default columns are crontab's own rule, and it is the one your intuition already holds: **a schedule whose minute or hour field is a wildcard is an interval, and intervals follow absolute time.** `*/15 * * * *` keeps firing every fifteen minutes across a transition — it neither repeats nor skips — while `30 2 * * *` names a wall-clock time, and a wall-clock time is exactly what DST takes away and gives back twice.

```ts
// A duplicated hour: 2026-11-01, New York repeats 01:00-01:59.
nextN(parseCron('30 1 * * *'), midnight, 2, { tz });
// → 01:30 EDT, then 01:30 the *next day* — the second pass is skipped
nextN(parseCron('30 1 * * *'), midnight, 2, { tz, ambiguous: 'both' });
// → 01:30 EDT and 01:30 EST, an hour apart

// The same hour, for a job that runs on an interval:
nextN(parseCron('*/15 * * * *'), at('2026-11-01T05:15:00Z'), 7, { tz });
// → 05:30, 05:45, 06:00, 06:15, 06:30, 06:45, 07:00 UTC — fifteen minutes apart, all seven
```

`isInterval(schedule)` tells you which column a schedule landed in. Passing `nonexistent` or `ambiguous` explicitly always wins.

## API

### Parsing

```ts
parseCron(expression: string, options?: {
    seconds?: boolean;          // default: five fields minute-first, six second-first
    domDowMode?: 'or' | 'and';  // default 'or', which is what crontab does
}): CronSchedule

safeParseCron(expression, options?): { ok: true; schedule } | { ok: false; error: CronSyntaxError }
```

`CronSyntaxError` carries `field`, `index` and `source`, so a form can underline the characters that failed:

```ts
const result = safeParseCron('0 0 * * 9');
// result.error.field → 'dayOfWeek'
// result.error.index → 8
// result.error.message → 'cron-primitives: 9 is out of range 0-7 in dayOfWeek field of "0 0 * * 9"'
```

A schedule is plain JSON, so it can come back from storage in any shape. The first
query on a restored schedule checks it: values are sorted and deduplicated, and a
field that is empty or out of range throws a `TypeError` rather than answering with
an instant that was never scheduled.

### Querying

Every function takes the schedule, an instant in epoch milliseconds, and the same `Options`.

```ts
next(schedule, after, options?): number | null       // strictly after
prev(schedule, before, options?): number | null      // strictly before
nextN(schedule, after, count, options?): number[]    // ascending, short if the horizon runs out
occurrences(schedule, { from, to }, options?): Generator<number>   // (from, to], lazily
matches(schedule, instant, options?): boolean        // wall-clock match, to the second
```

```ts
interface Options {
    tz?: string; // IANA name, default 'UTC' — the host zone is never consulted
    nonexistent?: 'skip' | 'shiftForward' | 'throw';
    ambiguous?: 'first' | 'second' | 'both';
    maxYears?: number; // search horizon, default 5
}
```

`null` means "not within the horizon". `0 0 30 2 *` never fires, and saying so beats spinning. The horizon bounds each search, not a sequence: every instant `nextN` returns is within `maxYears` of the one before it.

`matches` asks the calendar question only, so it can disagree with `next` at the two instants a year where that is the whole point: `next` can return an instant `matches` rejects (that is `shiftForward`), and can skip one it accepts (that is `ambiguous: 'first'`).

### Catch-up

```ts
dueSince(schedule, { lastRunAt }, now, options?): {
    state: { lastRunAt: number };
    due: number[];        // (lastRunAt, now], ascending, at most maxCatchUp
    truncated: boolean;
}

isDue(schedule, { lastRunAt }, now, options?): boolean   // the cheap check first
```

### Time zones — `cron-primitives/tz`

The zone layer is public because it is independently useful, and because nobody believes this part works until they can call it themselves.

```ts
import { offsetAt, wallFromEpoch, epochFromWall } from 'cron-primitives/tz';

offsetAt('Asia/Kathmandu', Date.now()); // → 345 (minutes east of UTC)
wallFromEpoch('Pacific/Chatham', Date.now()); // → { year, month, day, hour, minute, second, weekday }

epochFromWall('America/New_York', {
    year: 2026,
    month: 11,
    day: 1,
    hour: 1,
    minute: 30,
    second: 0,
});
// → { kind: 'ambiguous', instants: [05:30Z, 06:30Z] }
epochFromWall('America/New_York', { year: 2026, month: 3, day: 8, hour: 2, minute: 30, second: 0 });
// → { kind: 'gap', instants: [], gapEndsAt: 07:00Z }
```

`clearTimeZoneCache()` drops the memoized offsets and `Intl.DateTimeFormat` instances — useful in a benchmark, and in an isolate that outlives a tzdata update.

### Words — `cron-primitives/describe`

```ts
import { describeCron } from 'cron-primitives/describe';

describeCron(parseCron('30 2 * * 1#3'), { tz: 'Europe/Warsaw' });
// → 'at 02:30, on the third Monday of the month (Europe/Warsaw)'
describeCron(parseCron('*/15 * * * *')); // → 'every 15 minutes'
describeCron(parseCron('0 0 L * *')); // → 'at 00:00, on the last day of the month'
```

English is the default, not the only option: every word the function can say lives in a `DescribeStrings` dictionary, and `strings` overrides as much of it as you like. `englishStrings` is exported to build on.

```ts
import { describeCron, englishStrings, type DescribeStrings } from 'cron-primitives/describe';

describeCron(parseCron('0 9 * * *'), { strings: { everyDay: 'daily' } });
// → 'at 09:00, daily'

// A whole language: build on English and override what you have translated, so
// an entry you have not reached yet stays a word rather than becoming undefined.
const german: DescribeStrings = {
    ...englishStrings,
    dayNames: ['Sonntag', 'Montag' /* … */],
    atTimes: times => `um ${times}`,
    everyDay: 'täglich',
    list: (items, conjunction) => items.join(conjunction === 'and' ? ' und ' : ' oder '),
};
describeCron(parseCron('0 9 * * *'), { strings: german }); // → 'um 09:00, täglich'
```

The pieces reach each entry already rendered by the same dictionary, so overriding `ordinal`, `list` or `dayNames` alone changes every sentence that uses one. Word order is a dictionary entry too: `sentence` receives the time, day and month phrases separately, and decides how they go together — as does `bothDayFields`, for the two-day-field case where the connector carries the `or`/`and` meaning.

### Timers — `cron-primitives/schedule`

For the case the rest of the package exists to avoid: a process that stays alive and would rather not write the loop.

```ts
import { scheduleCron } from 'cron-primitives/schedule';

const runner = scheduleCron(parseCron('0 * * * *'), firedAt => report(firedAt), {
    tz: 'Europe/Warsaw',
    catchUp: true, // fire what was missed while the process was blocked
});

runner.nextAt(); // the instant the next fire is armed for
runner.stop();
```

The handler receives the instant it was **scheduled** for, not the instant it actually ran — timers are late, and the difference matters to anything that writes the time down. Waits longer than `setTimeout` can hold are re-armed in slices instead of firing immediately. `now`, `setTimer` and `clearTimer` are injectable, which is how this package's own tests run a year of schedule in a millisecond.

A schedule does not wait for the job. If the handler returns a promise and the next occurrence arrives before it settles, the default is to call the handler again — two copies of the job, running at once. `preventOverlap` is the other choice, and it has a name for the same reason the DST policies do:

```ts
const runner = scheduleCron(parseCron('* * * * *'), () => syncEverything(), {
    preventOverlap: true, // a fire that would overlap the last one is dropped
    onSkip: firedAt => log.warn('skipped', firedAt),
});
```

The occurrence is dropped, not queued: the handler is not called, `onSkip` says which instant went by, and `lastRunAt` still moves past it, so `catchUp` does not replay it later either. In a catch-up batch the same rule applies per occurrence, which is what keeps a five-hour backlog from becoming five concurrent jobs. A synchronous handler can never overlap itself, so the option costs it nothing.

The runner keeps arming either way — it is the fire that is dropped, not the schedule. A promise that never settles therefore skips every occurrence after it, which is the honest reading of "do not overlap" and an argument for giving the handler its own timeout.

## Syntax

| Form               | Example                  | Notes                                                                     |
| ------------------ | ------------------------ | ------------------------------------------------------------------------- |
| Five fields        | `30 9 * * 1-5`           | minute hour day-of-month month day-of-week                                |
| Six fields         | `0 30 9 * * *`           | leading seconds field                                                     |
| Steps              | `*/15`, `0-30/5`, `5/15` | `5/15` is "from 5 to the end, every 15"                                   |
| Lists and ranges   | `1,15`, `9-17`           |                                                                           |
| Names              | `JAN`, `mon-FRI`         | case-insensitive, usable in ranges                                        |
| Sunday             | `0` or `7`               | `FRI-MON` wraps; other fields refuse a backwards range                    |
| Macros             | `@daily`                 | `@yearly` `@annually` `@monthly` `@weekly` `@daily` `@midnight` `@hourly` |
| Periods            | `@every 5m`              | `s` `m` `h` `d`, long or short: `@every 30s`, `@every 15 minutes`         |
| Last day           | `L`, `L-3`               | last day of the month, and three days before it                           |
| Nearest weekday    | `15W`, `LW`              | never leaves the month                                                    |
| Nth / last weekday | `5#3`, `5L`              | third Friday, last Friday                                                 |
| Blank field        | `?`                      | accepted as a synonym for `*`                                             |

`@every` expands to the step it means — `@every 5m` is `*/5 * * * *`, `@every 30s` is `*/30 * * * * *`, `@every 2h` is `0 */2 * * *`, `@every 1d` is `@daily` — which means it only accepts the periods a cron step can actually hold:

```ts
parseCron('@every 7m');
// → CronSyntaxError: @every 7m does not divide the hour evenly — a cron step
//   restarts at the start of every hour
parseCron('@every 3d');
// → CronSyntaxError: @every 3d is not a cron schedule — the day-of-month field
//   restarts every month
```

A `*/7` minute field fires seven minutes apart until :56 and then four minutes later, so reading `@every 7m` as `*/7` would answer a question nobody asked. Refusing it is the only honest option a cron field leaves.

Not supported, deliberately: `@reboot` (there is no process to boot) and Jenkins-style `H` hashing.

### The day-of-month / day-of-week trap

`0 0 13 * 5` is **the 13th _or_ any Friday** — not "Friday the 13th". When both day fields are restricted, crontab matches either one, and this package matches crontab:

```ts
nextN(parseCron('0 0 13 * 5'), februaryFirst, 3);
// → Feb 6 (Friday), Feb 13, Feb 20 (Friday)

nextN(parseCron('0 0 13 * 5', { domDowMode: 'and' }), februaryFirst, 3);
// → Feb 13, Mar 13, Nov 13 — the reading you expected
```

A field counts as unrestricted when it begins with `*` or is `?`, which is exactly how Vixie cron sets its flags — including `*/2`.

## Accuracy, and where it stops

- **Zone data comes from ICU**, so the answers are as current as the runtime's tzdata. A Node built with `small-icu` only knows UTC; every non-UTC assertion in the smoke test is guarded by a capability check for that reason.
- **1970 onward.** Every IANA offset in that range is a whole number of minutes. Earlier instants fall back on LMT offsets carrying seconds, which `offsetAt` rounds.
- **UTC is a fast path.** No ICU call is made at all, and `next` costs about 0.7 µs. In a real zone it is around 5 µs, dominated by cached `Intl.DateTimeFormat` lookups.
- **Transition detection assumes tzdata never places two transitions closer than a week.** The tightest real pairs — Morocco's Ramadan pauses, the 2023 Egyptian rules — are about a month apart.
- **Schedules are immutable.** The search memoizes lookup tables against the object identity, so mutating a schedule after handing it over is undefined.

## Tested against

The suite is built out of things that have broken real libraries, not a random sample:

- a **minute-by-minute brute-force scan** of the calendar, written straight against ICU so it shares no code with what it checks, across six windows in six zones;
- a **frozen answer sheet** of 96 differential fixtures generated from [`cron-parser`](https://github.com/harrisiirak/cron-parser) (`npm run fixtures`), so a behaviour change shows up as a diff rather than as a red build nobody can reproduce;
- **`Australia/Lord_Howe`** (a 30-minute DST shift), **`Pacific/Chatham`** (+12:45), **`Asia/Kathmandu`** (+05:45), **`America/Santiago`** (a transition that deletes midnight), **`Africa/Cairo`** (reintroduced DST in 2023), **`Asia/Tehran`** (abolished it in 2022) and **`Pacific/Apia`** (deleted 30 December 2011 entirely);
- a **purity test** that fails the build if anything outside `src/schedule` reads a clock, allocates a timer, imports a Node builtin, goes async, or touches a local-time `Date` accessor.

## When not to use this

If a long-lived process can own the loop and you do not care what happens across a DST transition, [`croner`](https://github.com/hexagon/croner) is a fine choice and comes with the timer built in. Use this one when the schedule has to survive the process, when "what did I miss?" is a real question, or when someone is going to ask which of the two 01:30s the job ran at.

## Development

```sh
npm install
npm test              # unit tests (vitest)
npm run lint          # eslint
npm run typecheck     # tsc --noEmit
npm run build         # tsup → dist/
npm run size          # size-limit budgets
npm run smoke         # run dist/ on the oldest supported Node
npm run bench         # rough timings
npm run fixtures      # regenerate the differential answer sheet
```

## License

MIT © Pavel Lazarchuk
