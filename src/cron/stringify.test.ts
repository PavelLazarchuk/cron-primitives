import { describe, expect, it } from 'vitest';
import fixtures from '../fixtures/cron-parser.json' with { type: 'json' };
import { parseCron } from './parse';
import { equals, stringify } from './stringify';

const roundtrip = (expression: string, seconds?: boolean) =>
    stringify(parseCron(expression, { seconds }));

describe('stringify', () => {
    it('keeps a plain expression plain', () => {
        expect(roundtrip('30 9 * * *')).toBe('30 9 * * *');
        expect(roundtrip('0 0 * * *')).toBe('0 0 * * *');
    });

    it('folds a run of three or more into a range', () => {
        expect(roundtrip('1,2,3 * * * *')).toBe('1-3 * * * *');
        expect(roundtrip('1,2 * * * *')).toBe('1,2 * * * *');
        expect(roundtrip('0 9,10,11,14 * * *')).toBe('0 9-11,14 * * *');
    });

    it('folds even spacing that reaches the end of the field into a step', () => {
        expect(roundtrip('0,15,30,45 * * * *')).toBe('*/15 * * * *');
        expect(roundtrip('*/7 * * * *')).toBe('*/7 * * * *');
        expect(roundtrip('5,15,25,35,45,55 * * * *')).toBe('5-55/10 * * * *');
    });

    it('leaves spacing that stops short of the end as a list', () => {
        expect(roundtrip('0,10,20 * * * *')).toBe('0,10,20 * * * *');
    });

    it('writes a whole field as a star', () => {
        expect(roundtrip('* * * * *')).toBe('* * * * *');
        expect(roundtrip('0 0 ? * ?')).toBe('0 0 * * *');
    });

    it('reproduces the Quartz modifiers term for term', () => {
        expect(roundtrip('0 0 L * *')).toBe('0 0 L * *');
        expect(roundtrip('0 0 L-3 * *')).toBe('0 0 L-3 * *');
        expect(roundtrip('0 0 LW * *')).toBe('0 0 LW * *');
        expect(roundtrip('0 0 15W * *')).toBe('0 0 15W * *');
        expect(roundtrip('0 0 * * 5L')).toBe('0 0 * * 5L');
        expect(roundtrip('0 0 * * 5#3')).toBe('0 0 * * 5#3');
        expect(roundtrip('0 0 1,15,L * *')).toBe('0 0 1,15,L * *');
    });

    it('resolves names to the numbers the parser read', () => {
        expect(roundtrip('0 0 * JAN-MAR MON')).toBe('0 0 * 1-3 1');
        expect(roundtrip('0 0 * * SUN')).toBe('0 0 * * 0');
    });

    it('writes the seconds field when the schedule has one', () => {
        expect(roundtrip('*/30 * * * * *')).toBe('*/30 * * * * *');
        expect(roundtrip('0 30 9 * * *')).toBe('0 30 9 * * *');
    });

    it('drops a seconds field of plain zero when asked, and keeps a real one', () => {
        const atZero = parseCron('0 30 9 * * *');
        const atFive = parseCron('5 30 9 * * *');

        expect(stringify(atZero, { seconds: false })).toBe('30 9 * * *');
        expect(stringify(atFive, { seconds: false })).toBe('5 30 9 * * *');
        expect(stringify(parseCron('30 9 * * *'), { seconds: true })).toBe('0 30 9 * * *');
    });

    it('keeps the year field', () => {
        expect(roundtrip('0 0 1 1 * 2030', false)).toBe('0 0 1 1 * 2030');
        expect(roundtrip('0 0 0 1 1 * 2030,2031')).toBe('0 0 0 1 1 * 2030,2031');
        expect(roundtrip('0 0 1 1 * *', false)).toBe('0 0 1 1 *');
    });

    it('names the five schedules that have a name, on request', () => {
        expect(stringify(parseCron('@daily'), { macros: true })).toBe('@daily');
        expect(stringify(parseCron('0 0 * * *'), { macros: true })).toBe('@daily');
        expect(stringify(parseCron('@midnight'), { macros: true })).toBe('@daily');
        expect(stringify(parseCron('@annually'), { macros: true })).toBe('@yearly');
        expect(stringify(parseCron('0 0 1 * *'), { macros: true })).toBe('@monthly');
        expect(stringify(parseCron('0 0 * * 0'), { macros: true })).toBe('@weekly');
        expect(stringify(parseCron('0 * * * *'), { macros: true })).toBe('@hourly');
        expect(stringify(parseCron('0 0 * * *'))).toBe('0 0 * * *');
    });

    it('never shortens a schedule with seconds or a year to a macro', () => {
        expect(stringify(parseCron('0 0 0 * * *'), { macros: true })).toBe('0 0 0 * * *');
        expect(stringify(parseCron('0 0 1 1 * 2030', { seconds: false }), { macros: true })).toBe(
            '0 0 1 1 * 2030'
        );
    });

    it('gives @reboot back as itself', () => {
        expect(stringify(parseCron('@reboot'))).toBe('@reboot');
        expect(stringify(parseCron('@reboot'), { macros: true })).toBe('@reboot');
    });

    it('keeps an unrestricted day-of-month unrestricted', () => {
        const source = parseCron('0 0 */2 * 1');

        expect(stringify(source)).toBe('0 0 */2 * 1');
        expect(parseCron(stringify(source)).dom.restricted).toBe(false);
    });

    it('never turns a restricted day field into a star, however short that would be', () => {
        expect(roundtrip('0 0 * * 0,6')).toBe('0 0 * * 0,6');
        expect(roundtrip('0 0 13 * 0-6')).toBe('0 0 13 * 0-6');
        expect(roundtrip('0 0 1-31 * *')).toBe('0 0 1-31 * *');
        expect(parseCron(roundtrip('0 0 * * 0,6')).dow.restricted).toBe(true);
        expect(parseCron(roundtrip('0 0 13 * 0-6')).dow.restricted).toBe(true);
        expect(parseCron(roundtrip('0 0 1-31 * *')).dom.restricted).toBe(true);
    });

    it('canonicalises a schedule that came back from storage in another shape', () => {
        const stored = parseCron('5,30 9 * * 1,5');

        const shuffled = {
            ...stored,
            minute: [30, 5, 30],
            dow: { ...stored.dow, days: [5, 1] },
        };

        expect(stringify(shuffled)).toBe('5,30 9 * * 1,5');
        expect(equals(shuffled, stored)).toBe(true);
    });

    it('sorts the nth-weekday terms, so the order they were written in does not count', () => {
        const a = parseCron('0 0 * * 1#1,5#3');
        const b = parseCron('0 0 * * 5#3,1#1');

        expect(stringify(a)).toBe(stringify(b));
        expect(equals(a, b)).toBe(true);
    });

    it('leaves out a year field that has no values left', () => {
        const stored = { ...parseCron('0 0 1 1 *'), year: [] };

        expect(stringify(stored)).toBe('0 0 1 1 *');
    });

    it('parses back into the very same schedule, for every fixture', () => {
        for (const { expression } of fixtures.fixtures) {
            const schedule = parseCron(expression);

            expect(parseCron(stringify(schedule), { seconds: schedule.hasSeconds })).toEqual(
                schedule
            );
        }
    });

    it('parses back into the very same schedule for the Quartz modifiers too', () => {
        const expressions = [
            '0 0 * * 0,6',
            '0 0 13 * 0-6',
            '0 0 1-31 * *',
            '0 0 */2 * 1',
            '0 0 L-3,15W,LW * *',
            '0 0 * * 5L,1#1',
            '30 */4 1,15 JAN-JUN MON-FRI',
            '*/30 * * * * *',
            '0 0 29 2 *',
        ];

        for (const expression of expressions) {
            const schedule = parseCron(expression);

            expect(parseCron(stringify(schedule), { seconds: schedule.hasSeconds })).toEqual(
                schedule
            );
        }
    });
});

describe('equals', () => {
    it('sees through the spelling', () => {
        expect(equals('0 0 * * *', '@daily')).toBe(true);
        expect(equals('0 0 * * *', '0 0 0 * * *')).toBe(true);
        expect(equals('1,2,3 * * * *', '1-3 * * * *')).toBe(true);
        expect(equals('0,15,30,45 * * * *', '*/15 * * * *')).toBe(true);
        expect(equals('0 0 * JAN MON', '0 0 * 1 1')).toBe(true);
    });

    it('takes schedules as readily as strings', () => {
        expect(equals(parseCron('@hourly'), '0 * * * *')).toBe(true);
        expect(equals(parseCron('@hourly'), parseCron('0 * * * *'))).toBe(true);
    });

    it('tells apart schedules that fire differently', () => {
        expect(equals('0 0 * * *', '0 1 * * *')).toBe(false);
        expect(equals('5 0 * * * *', '0 0 * * *')).toBe(false);
        expect(equals('0 0 1 1 *', '@reboot')).toBe(false);
        expect(equals('0 0 1 1 * 2030', '0 0 1 1 *', { seconds: false })).toBe(false);
    });

    it('counts the day-of-month and day-of-week reading as part of the schedule', () => {
        expect(
            equals(parseCron('0 0 13 * 5'), parseCron('0 0 13 * 5', { domDowMode: 'and' }))
        ).toBe(false);
    });
});
