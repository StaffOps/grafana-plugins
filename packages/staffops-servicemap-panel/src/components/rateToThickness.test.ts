/**
 * Unit tests for rateToThickness edge-width mapping.
 * Validates the 1–5px range, proportional scaling, and edge cases.
 */

import { rateToThickness } from './ServiceMapPanel';

describe('rateToThickness', () => {
  it('returns 1 when maxRate is 0', () => {
    expect(rateToThickness(10, 0)).toBe(1);
  });

  it('returns 1 when maxRate is negative', () => {
    expect(rateToThickness(10, -5)).toBe(1);
  });

  it('returns minimum (1) for rate=0', () => {
    expect(rateToThickness(0, 100)).toBe(1);
  });

  it('returns maximum (5) for rate=maxRate', () => {
    expect(rateToThickness(100, 100)).toBe(5);
  });

  it('returns midpoint (3) for rate at half of maxRate', () => {
    expect(rateToThickness(50, 100)).toBe(3);
  });

  it('maps linearly: quarter rate gives 2', () => {
    expect(rateToThickness(25, 100)).toBe(2);
  });

  it('clamps when rate exceeds maxRate', () => {
    // ratio capped at 1 -> should give 5
    expect(rateToThickness(200, 100)).toBe(5);
  });

  it('never goes below 1 for very small rates', () => {
    expect(rateToThickness(0.001, 1000)).toBeGreaterThanOrEqual(1);
  });

  it('never exceeds 5', () => {
    expect(rateToThickness(999999, 100)).toBeLessThanOrEqual(5);
  });

  it('returns consistent range across different maxRate values', () => {
    // At 100% rate, always 5 regardless of maxRate
    expect(rateToThickness(1, 1)).toBe(5);
    expect(rateToThickness(1000, 1000)).toBe(5);
    expect(rateToThickness(0.5, 0.5)).toBe(5);
  });
});
