# cron-primitives

## 1.3.0

### Minor Changes

- 727059a: `stringify` and `equals`: the way back out of a `CronSchedule`.

    - `stringify(schedule, { seconds?, macros? })` writes the shortest expression that parses back into the same schedule — `1,2,3` becomes `1-3`, `0,15,30,45` becomes `*/15`, month and weekday names become the numbers they stood for, and `macros: true` names the five schedules that have a name. `L`, `W`, `#`, the year field and `@reboot` are reproduced term for term. A schedule that fires on a non-zero second keeps its seconds field whatever `seconds` asks for, since five fields cannot say it, and a day field that was written restricted stays restricted rather than collapsing to a star.
    - `equals(a, b, options?)` compares two schedules, or two expressions, through that canonical form: `'0 0 * * *'`, `'@daily'` and `'0 0 0 * * *'` are one schedule written three ways. `domDowMode` is compared too, because it changes when the schedule fires.

    Both are exported from the root and from `cron-primitives/cron`. Every parser fixture is now round-tripped through `stringify` in the test suite.

    `stringify` normalises before it writes, so a schedule that came back from storage with its values out of order — or duplicated — still produces the canonical string, and `equals` still sees the two as one schedule.

    The root entry grows to 6.43 kB gzipped and `cron-primitives/cron` to 3.17 kB.

## 1.2.0

### Minor Changes

- 26bfd23: Quartz's year field and `@reboot`.

    A seventh field pins a schedule to particular years — `0 30 9 1 1 ? 2027`, or `30 9 1 1 ? 2027-2029` with `{ seconds: false }`. Six bare fields still mean a leading seconds field, so stored schedules read exactly as before, and an unrestricted year stays off the schedule rather than becoming a hundred and thirty entries.

    `@reboot` now parses instead of failing, so a whole crontab loads. It is an event and not a time, so `next`, `prev` and `matches` answer "never", `describeCron` says "at startup", and the new `isReboot(schedule)` is how you branch to run it yourself.

    `describeCron` gains `inYears`, `inYearsThrough` and `atStartup`, and its `sentence` parts now carry `years`.

## 1.1.0

### Minor Changes

- 1bdd9b5: Three additions, no behaviour changed for code that does not ask for them.

    **`@every <count><unit>`** parses, as `s`, `m`, `h` or `d`, long or short: `@every 30s` is `*/30 * * * * *`, `@every 5m` is `*/5 * * * *`, `@every 2h` is `0 */2 * * *`, `@every 1d` is `@daily`. A period that a cron step cannot hold is refused rather than approximated — `@every 7m` would fire seven minutes apart until :56 and then four, and `@every 3d` cannot survive a month boundary, so both throw a `CronSyntaxError` that says so.

    **`preventOverlap` and `onSkip` on `scheduleCron`.** A handler that returns a promise is still running until it settles, and until now the next occurrence called it again regardless — two copies of the job at once, and a whole fan-out of them under `catchUp`. With `preventOverlap: true` the overlapping occurrence is dropped: the handler is not called, `onSkip` reports the instant, and `lastRunAt` still moves past it so catch-up does not replay it later. The default is unchanged.

    **Fixed:** a handler that called `runner.stop()` part-way through a catch-up batch was still called for the rest of it. `stop` now stops the batch too.

    **`describeCron` speaks other languages.** Every word it can say now lives in a `DescribeStrings` dictionary, and the new `strings` option overrides any part of it — one word or the whole language. `englishStrings` is exported to build on, and word order is a dictionary entry too, so a language that puts the months first is a `sentence` override rather than a fork.

## 1.0.0

### Major Changes

- Initial release.
- TypeScript support.
- Documentation.
