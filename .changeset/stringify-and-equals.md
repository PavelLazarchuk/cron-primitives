---
'cron-primitives': minor
---

`stringify` and `equals`: the way back out of a `CronSchedule`.

- `stringify(schedule, { seconds?, macros? })` writes the shortest expression that parses back into the same schedule — `1,2,3` becomes `1-3`, `0,15,30,45` becomes `*/15`, month and weekday names become the numbers they stood for, and `macros: true` names the five schedules that have a name. `L`, `W`, `#`, the year field and `@reboot` are reproduced term for term. A schedule that fires on a non-zero second keeps its seconds field whatever `seconds` asks for, since five fields cannot say it, and a day field that was written restricted stays restricted rather than collapsing to a star.
- `equals(a, b, options?)` compares two schedules, or two expressions, through that canonical form: `'0 0 * * *'`, `'@daily'` and `'0 0 0 * * *'` are one schedule written three ways. `domDowMode` is compared too, because it changes when the schedule fires.

Both are exported from the root and from `cron-primitives/cron`. Every parser fixture is now round-tripped through `stringify` in the test suite.

`stringify` normalises before it writes, so a schedule that came back from storage with its values out of order — or duplicated — still produces the canonical string, and `equals` still sees the two as one schedule.

The root entry grows to 6.43 kB gzipped and `cron-primitives/cron` to 3.17 kB.
