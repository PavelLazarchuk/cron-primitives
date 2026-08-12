import { dueSince } from '../catchup/dueSince';
import { nextInstant } from '../core/search';
import type { CronSchedule, Options } from '../core/types';

type TimerHandle = unknown;

export interface ScheduleOptions extends Options {
    now?: () => number;
    setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
    clearTimer?: (handle: TimerHandle) => void;
    lastRunAt?: number;
    catchUp?: boolean;
    maxCatchUp?: number;
    onError?: (error: unknown, firedAt: number) => void;
}

export interface CronRunner {
    nextAt(): number | null;
    stop(): void;
}

const MAX_DELAY = 2_147_483_647;

export function scheduleCron(
    schedule: CronSchedule,
    handler: (firedAt: number) => void | Promise<void>,
    options: ScheduleOptions = {}
): CronRunner {
    const now = options.now ?? Date.now;
    const setTimer = options.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
    const clearTimer =
        options.clearTimer ?? ((handle: TimerHandle) => clearTimeout(handle as never));

    let handle: TimerHandle | undefined;
    let target: number | null = null;
    let lastRunAt = options.lastRunAt ?? now();
    let stopped = false;

    const report = (error: unknown, firedAt: number): void => {
        if (options.onError !== undefined) options.onError(error, firedAt);
        else
            setTimer(() => {
                throw error;
            }, 0);
    };

    const invoke = (firedAt: number): void => {
        try {
            const result = handler(firedAt);
            if (result instanceof Promise) result.catch(error => report(error, firedAt));
        } catch (error) {
            report(error, firedAt);
        }
    };

    const arm = (): void => {
        if (stopped) return;
        target = nextInstant(schedule, lastRunAt, options);
        if (target === null) return;
        handle = setTimer(fire, Math.max(0, Math.min(target - now(), MAX_DELAY)));
    };

    function fire(): void {
        if (stopped) return;
        const current = now();

        if (target !== null && current < target) {
            handle = setTimer(fire, Math.min(target - current, MAX_DELAY));
            return;
        }

        if (options.catchUp === true) {
            const result = dueSince(schedule, { lastRunAt }, current, options);
            for (const firedAt of result.due) invoke(firedAt);
            lastRunAt = result.state.lastRunAt;
        } else if (target !== null) {
            invoke(target);
            lastRunAt = Math.max(target, current);
        }

        arm();
    }

    arm();

    return {
        nextAt: () => target,
        stop: () => {
            stopped = true;
            target = null;
            if (handle !== undefined) clearTimer(handle);
        },
    };
}
