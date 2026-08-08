import { describe, expect, it } from 'vitest';
import { clamp, clampDelta, formatSeconds, lerp, lerpAngle, wrapAngle } from '@/utils/math';

describe('clamp', () => {
  it('bounds values on both sides', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(50, 0, 10)).toBe(10);
    expect(clamp(4, 0, 10)).toBe(4);
  });
});

describe('lerp', () => {
  it('interpolates linearly', () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(0, 10, 0.25)).toBe(2.5);
  });
});

describe('wrapAngle', () => {
  it('wraps into (-PI, PI]', () => {
    expect(wrapAngle(0)).toBeCloseTo(0);
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI * 3)).toBeCloseTo(Math.PI);
  });
});

const deg = (d: number): number => (d * Math.PI) / 180;

describe('lerpAngle', () => {
  it('takes the shortest arc across the +/-PI seam', () => {
    // 170deg -> -170deg is +20deg the short way, so the midpoint is 180deg,
    // not the 0deg a naive linear blend would produce.
    const mid = lerpAngle(deg(170), deg(-170), 0.5);
    expect(Math.abs(wrapAngle(mid))).toBeCloseTo(Math.PI, 5);
  });

  it('returns the endpoints at t = 0 and t = 1', () => {
    expect(lerpAngle(0.5, 1.5, 0)).toBeCloseTo(0.5);
    expect(lerpAngle(0.5, 1.5, 1)).toBeCloseTo(1.5);
  });
});

describe('clampDelta', () => {
  it('caps long stalls so the simulation cannot fast-forward', () => {
    expect(clampDelta(5000, 50)).toBe(50);
    expect(clampDelta(16.6, 50)).toBeCloseTo(16.6);
  });

  it('treats invalid deltas as zero', () => {
    expect(clampDelta(Number.NaN, 50)).toBe(0);
    expect(clampDelta(-10, 50)).toBe(0);
  });
});

describe('formatSeconds', () => {
  it('renders two decimals and never goes negative', () => {
    expect(formatSeconds(20000)).toBe('20.00');
    expect(formatSeconds(1234)).toBe('1.23');
    expect(formatSeconds(-500)).toBe('0.00');
  });
});
