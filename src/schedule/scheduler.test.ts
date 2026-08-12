import { describe, expect, it } from 'vitest';
import { parseCron } from '../cron/parse';
import { at, isoAll } from '../testUtils';
import { scheduleCron } from './index';

function harness(start: number) {
    let now = start;
    const timers = new Map<number, { fireAt: number; callback: () => void }>();
    let nextId = 1;

    return {
        options: {
            now: () => now,
            setTimer: (callback: () => void, delay: number) => {
                const id = nextId++;
                timers.set(id, { fireAt: now + delay, callback });
                return id;
            },
            clearTimer: (handle: unknown) => {
                timers.delete(handle as number);
            },
        },
        advanceTo(target: number) {
            for (let guard = 0; guard < 10_000; guard += 1) {
                let earliest: { id: number; fireAt: number; callback: () => void } | undefined;
                for (const [id, timer] of timers) {
                    if (earliest === undefined || timer.fireAt < earliest.fireAt) {
                        earliest = { id, ...timer };
                    }
                }
                if (earliest === undefined || earliest.fireAt > target) break;
                timers.delete(earliest.id);
                now = Math.max(now, earliest.fireAt);
                earliest.callback();
            }
            now = target;
        },
        freezeTo(target: number) {
            now = target;
        },
        pending: () => timers.size,
    };
}

const START = at('2026-01-01T00:00:00Z');

describe('scheduleCron', () => {
    it('fires on schedule, with the instant it was scheduled for', () => {
        const clock = harness(START);
        const fired: number[] = [];
        const runner = scheduleCron(parseCron('0 * * * *'), instant => void fired.push(instant), {
            ...clock.options,
        });

        clock.advanceTo(at('2026-01-01T03:30:00Z'));
        expect(isoAll(fired)).toEqual([
            '2026-01-01T01:00:00.000Z',
            '2026-01-01T02:00:00.000Z',
            '2026-01-01T03:00:00.000Z',
        ]);
        runner.stop();
    });

    it('stops firing once stopped', () => {
        const clock = harness(START);
        const fired: number[] = [];
        const runner = scheduleCron(parseCron('0 * * * *'), instant => void fired.push(instant), {
            ...clock.options,
        });

        clock.advanceTo(at('2026-01-01T01:30:00Z'));
        runner.stop();
        clock.advanceTo(at('2026-01-01T06:00:00Z'));
        expect(fired).toHaveLength(1);
        expect(runner.nextAt()).toBeNull();
        expect(clock.pending()).toBe(0);
    });

    it('re-arms rather than firing early when a wait is longer than a timer can hold', () => {
        const clock = harness(START);
        const fired: number[] = [];
        const runner = scheduleCron(parseCron('0 0 26 1 *'), instant => void fired.push(instant), {
            ...clock.options,
        });

        clock.advanceTo(at('2026-01-25T00:00:00Z'));
        expect(fired).toEqual([]);
        clock.advanceTo(at('2026-01-26T00:30:00Z'));
        expect(isoAll(fired)).toEqual(['2026-01-26T00:00:00.000Z']);
        runner.stop();
    });

    it('drops what it slept through, and replays it only when catch-up is on', () => {
        const asleep = harness(START);
        const missed: number[] = [];
        const runner = scheduleCron(parseCron('0 * * * *'), instant => void missed.push(instant), {
            ...asleep.options,
        });
        asleep.freezeTo(at('2026-01-01T05:30:00Z'));
        asleep.advanceTo(at('2026-01-01T05:30:00Z'));
        expect(isoAll(missed)).toEqual(['2026-01-01T01:00:00.000Z']);
        expect(runner.nextAt()).toBe(at('2026-01-01T06:00:00Z'));
        runner.stop();

        const catchingUp = harness(START);
        const caught: number[] = [];
        const catchUpRunner = scheduleCron(
            parseCron('0 * * * *'),
            instant => void caught.push(instant),
            { ...catchingUp.options, catchUp: true }
        );
        catchingUp.freezeTo(at('2026-01-01T05:30:00Z'));
        catchingUp.advanceTo(at('2026-01-01T05:30:00Z'));
        expect(isoAll(caught)).toEqual([
            '2026-01-01T01:00:00.000Z',
            '2026-01-01T02:00:00.000Z',
            '2026-01-01T03:00:00.000Z',
            '2026-01-01T04:00:00.000Z',
            '2026-01-01T05:00:00.000Z',
        ]);
        catchUpRunner.stop();
    });

    it('reports a throwing handler instead of losing it', () => {
        const clock = harness(START);
        const errors: unknown[] = [];
        const runner = scheduleCron(
            parseCron('0 * * * *'),
            () => {
                throw new Error('boom');
            },
            { ...clock.options, onError: error => void errors.push(error) }
        );

        clock.advanceTo(at('2026-01-01T02:30:00Z'));
        expect(errors).toHaveLength(2);
        expect((errors[0] as Error).message).toBe('boom');
        runner.stop();
    });

    it('reports a rejecting handler too, and keeps going', async () => {
        const clock = harness(START);
        const errors: unknown[] = [];
        const runner = scheduleCron(
            parseCron('0 * * * *'),
            () => Promise.reject(new Error('nope')),
            {
                ...clock.options,
                onError: error => void errors.push(error),
            }
        );

        clock.advanceTo(at('2026-01-01T02:30:00Z'));
        await Promise.resolve();
        await Promise.resolve();
        expect(errors).toHaveLength(2);
        runner.stop();
    });

    it('reports the instant it will fire next', () => {
        const clock = harness(START);
        const runner = scheduleCron(parseCron('0 * * * *'), () => {}, { ...clock.options });
        expect(runner.nextAt()).toBe(at('2026-01-01T01:00:00Z'));
        runner.stop();
    });

    it('goes quiet when the schedule is exhausted', () => {
        const clock = harness(START);
        const runner = scheduleCron(parseCron('0 0 30 2 *'), () => {}, { ...clock.options });
        expect(runner.nextAt()).toBeNull();
        expect(clock.pending()).toBe(0);
        runner.stop();
    });
});
