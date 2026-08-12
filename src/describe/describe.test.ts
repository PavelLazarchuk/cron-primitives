import { describe, expect, it } from 'vitest';
import { parseCron } from '../cron/parse';
import { describeCron, englishStrings, type DescribeStrings } from './index';

describe('describeCron', () => {
    it.each([
        ['* * * * *', 'every minute'],
        ['*/15 * * * *', 'every 15 minutes'],
        ['30 * * * *', 'at minute 30 of every hour'],
        ['0 */2 * * *', 'every 2 hours'],
        ['30 */6 * * *', 'every 6 hours at minute 30'],
        ['0 9 * * *', 'at 09:00, every day'],
        ['0 9,17 * * *', 'at 09:00 and 17:00, every day'],
        ['0 9 * * 1-5', 'at 09:00, on weekdays'],
        ['0 9 * * 0,6', 'at 09:00, on weekends'],
        ['0 9 * * 2-4', 'at 09:00, from Tuesday through Thursday'],
        ['0 0 1 * *', 'at 00:00, on the 1st'],
        ['0 0 1,15 * *', 'at 00:00, on the 1st and 15th'],
        ['0 0 L * *', 'at 00:00, on the last day of the month'],
        ['0 0 LW * *', 'at 00:00, on the last weekday of the month'],
        ['0 0 15W * *', 'at 00:00, on the weekday nearest the 15th'],
        ['30 2 * * 1#3', 'at 02:30, on the third Monday of the month'],
        ['0 0 * * 5L', 'at 00:00, on the last Friday of the month'],
        ['0 0 13 * 5', 'at 00:00, on the 13th or on Friday'],
        ['0 12 1 1,7 *', 'at 12:00, on the 1st, in January and July'],
        ['0 12 * 6-8 *', 'at 12:00, every day, in June through August'],
        ['* 9 * * *', 'every minute past hour 9'],
    ])('%s → %s', (expression, expected) => {
        expect(describeCron(parseCron(expression))).toBe(expected);
    });

    it('describes a seconds field', () => {
        expect(describeCron(parseCron('15 30 9 * * *'))).toBe('at 09:30:15, every day');
        expect(describeCron(parseCron('*/30 * * * * *'))).toBe('every 30 seconds');
        expect(describeCron(parseCron('* * * * * *'))).toBe('every second');
    });

    it('says which clock it means when told', () => {
        expect(describeCron(parseCron('0 9 * * *'), { tz: 'Europe/Warsaw' })).toBe(
            'at 09:00, every day (Europe/Warsaw)'
        );
    });

    it('says "and" when the schedule intersects its day fields', () => {
        expect(describeCron(parseCron('0 0 13 * 5', { domDowMode: 'and' }))).toBe(
            'at 00:00, on the 13th and on Friday'
        );
    });

    it('keeps a stepped day field instead of reading it as every day', () => {
        expect(describeCron(parseCron('0 0 */2 * *'))).toBe('at 00:00, every 2 days');
        expect(describeCron(parseCron('0 0 * * */2'))).toBe(
            'at 00:00, on Sunday, Tuesday, Thursday and Saturday'
        );
    });

    it('says "and" when only one day field is restricted, as the search does', () => {
        expect(describeCron(parseCron('0 0 */2 * 1'))).toBe('at 00:00, every 2 days and on Monday');
    });
});

describe('describeCron strings', () => {
    it('takes a single word without the rest of the language', () => {
        expect(describeCron(parseCron('0 9 * * *'), { strings: { everyDay: 'daily' } })).toBe(
            'at 09:00, daily'
        );
    });

    it('reaches every sentence that renders through an overridden piece', () => {
        const strings = { ordinal: (value: number) => `${value}.` };
        expect(describeCron(parseCron('0 0 1,15 * *'), { strings })).toBe(
            'at 00:00, on the 1. and 15.'
        );
        expect(describeCron(parseCron('0 0 15W * *'), { strings })).toBe(
            'at 00:00, on the weekday nearest the 15.'
        );
        expect(
            describeCron(parseCron('30 2 * * 1#3'), {
                strings: { nthWord: value => `#${value}` },
            })
        ).toBe('at 02:30, on the #3 Monday of the month');
    });

    it('lets a language reorder the sentence, not just translate it', () => {
        const strings: Partial<DescribeStrings> = {
            sentence: parts =>
                [parts.months, parts.days, parts.time].filter(part => part !== '').join('; '),
        };
        expect(describeCron(parseCron('0 12 1 1,7 *'), { strings })).toBe(
            'in January and July; on the 1st; at 12:00'
        );
    });

    it('describes a schedule in another language entirely', () => {
        const russian: Partial<DescribeStrings> = {
            dayNames: [
                'воскресенье',
                'понедельник',
                'вторник',
                'среду',
                'четверг',
                'пятницу',
                'субботу',
            ],
            monthNames: [
                'январе',
                'феврале',
                'марте',
                'апреле',
                'мае',
                'июне',
                'июле',
                'августе',
                'сентябре',
                'октябре',
                'ноябре',
                'декабре',
            ],
            list: (items, conjunction) =>
                items.length < 2
                    ? (items[0] ?? '')
                    : `${items.slice(0, -1).join(', ')} ${conjunction === 'and' ? 'и' : 'или'} ${items[items.length - 1] as string}`,
            atTimes: times => `в ${times}`,
            onDayNames: days => `по ${days}`,
            everyNMinutes: step => `каждые ${step} минут`,
            everyDay: 'каждый день',
            inMonths: months => `в ${months}`,
            inZone: (sentence, tz) => `${sentence} (${tz})`,
        };

        expect(describeCron(parseCron('0 9 * * *'), { strings: russian })).toBe(
            'в 09:00, каждый день'
        );
        expect(describeCron(parseCron('0 9 * * 1,3'), { strings: russian })).toBe(
            'в 09:00, по понедельник и среду'
        );
        expect(
            describeCron(parseCron('*/15 * * 1,7 *'), { strings: russian, tz: 'Europe/Warsaw' })
        ).toBe('каждые 15 минут, в январе и июле (Europe/Warsaw)');
    });

    it('leaves the shipped dictionary alone', () => {
        describeCron(parseCron('0 9 * * *'), { strings: { everyDay: 'daily' } });
        expect(englishStrings.everyDay).toBe('every day');
        expect(describeCron(parseCron('0 9 * * *'))).toBe('at 09:00, every day');
    });
});
