import { describe, expect, it } from 'vitest';
import { parseCron } from '../cron/parse';
import { describeCron } from './index';

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
