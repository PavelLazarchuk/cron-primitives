import { assertFinite } from '../core/errors';
import type { Wall } from '../core/types';
import {
    offsetMsAt,
    resolveWall,
    wallFromOffset,
    type WallInput,
    type WallResolution,
} from './zone';

export type { Wall } from '../core/types';
export type { WallInput, WallResolution } from './zone';
export { clearTimeZoneCache } from './zone';

export function offsetAt(tz: string, instant: number): number {
    assertFinite(instant, 'instant');
    return Math.round(offsetMsAt(tz, instant) / 60_000);
}

export function wallFromEpoch(tz: string, instant: number): Wall {
    assertFinite(instant, 'instant');
    return wallFromOffset(instant, offsetMsAt(tz, instant));
}

export function epochFromWall(tz: string, wall: WallInput): WallResolution {
    return resolveWall(tz, wall);
}
