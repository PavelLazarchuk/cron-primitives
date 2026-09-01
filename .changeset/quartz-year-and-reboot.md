---
'cron-primitives': minor
---

Quartz's year field and `@reboot`.

A seventh field pins a schedule to particular years — `0 30 9 1 1 ? 2027`, or `30 9 1 1 ? 2027-2029` with `{ seconds: false }`. Six bare fields still mean a leading seconds field, so stored schedules read exactly as before, and an unrestricted year stays off the schedule rather than becoming a hundred and thirty entries.

`@reboot` now parses instead of failing, so a whole crontab loads. It is an event and not a time, so `next`, `prev` and `matches` answer "never", `describeCron` says "at startup", and the new `isReboot(schedule)` is how you branch to run it yourself.

`describeCron` gains `inYears`, `inYearsThrough` and `atStartup`, and its `sentence` parts now carry `years`.
