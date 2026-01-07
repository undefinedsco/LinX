/**
 * Tests for fpstring serialization
 */

import { describe, it, expect } from 'vitest';
import { fpEncode, fpDecode } from '../../src/storage/quint/serialization';

describe('fpstring encoding', () => {
  describe('fpEncode', () => {
    it('should encode zero correctly', () => {
      const encoded = fpEncode(0);
      expect(encoded).toMatch(/^1/); // Sign indicator for zero
    });

    it('should encode positive integers', () => {
      const e1 = fpEncode(1);
      const e10 = fpEncode(10);
      const e100 = fpEncode(100);

      // Should sort correctly: 1 < 10 < 100
      expect(e1 < e10).toBe(true);
      expect(e10 < e100).toBe(true);
    });

    it('should encode negative integers', () => {
      const eNeg1 = fpEncode(-1);
      const eNeg10 = fpEncode(-10);
      const eNeg100 = fpEncode(-100);

      // Should sort correctly: -100 < -10 < -1
      expect(eNeg100 < eNeg10).toBe(true);
      expect(eNeg10 < eNeg1).toBe(true);
    });

    it('should order negative before positive', () => {
      const neg = fpEncode(-1);
      const zero = fpEncode(0);
      const pos = fpEncode(1);

      expect(neg < zero).toBe(true);
      expect(zero < pos).toBe(true);
    });

    it('should encode decimal numbers', () => {
      const e1_5 = fpEncode(1.5);
      const e2_5 = fpEncode(2.5);
      const e10_5 = fpEncode(10.5);

      expect(e1_5 < e2_5).toBe(true);
      expect(e2_5 < e10_5).toBe(true);
    });

    it('should handle very large numbers', () => {
      const e1000000 = fpEncode(1000000);
      const e1000001 = fpEncode(1000001);

      expect(e1000000 < e1000001).toBe(true);
    });

    it('should handle very small numbers', () => {
      const e0_001 = fpEncode(0.001);
      const e0_01 = fpEncode(0.01);
      const e0_1 = fpEncode(0.1);

      expect(e0_001 < e0_01).toBe(true);
      expect(e0_01 < e0_1).toBe(true);
    });
  });

  describe('fpDecode', () => {
    it('should decode zero correctly', () => {
      const decoded = fpDecode(fpEncode(0));
      expect(decoded).toBe(0);
    });

    it('should round-trip positive integers', () => {
      for (const num of [1, 10, 100, 1000, 999999]) {
        const decoded = fpDecode(fpEncode(num));
        expect(decoded).toBeCloseTo(num, 5);
      }
    });

    it('should round-trip negative integers', () => {
      for (const num of [-1, -10, -100, -1000]) {
        const decoded = fpDecode(fpEncode(num));
        expect(decoded).toBeCloseTo(num, 5);
      }
    });

    it('should round-trip decimal numbers', () => {
      for (const num of [1.5, 2.25, 3.14159, 0.001]) {
        const decoded = fpDecode(fpEncode(num));
        expect(decoded).toBeCloseTo(num, 5);
      }
    });
  });

  describe('sorting', () => {
    it('should maintain numeric order when sorting encoded strings', () => {
      const numbers = [-100, -10, -1, 0, 1, 10, 100];
      const encoded = numbers.map(n => ({ n, e: fpEncode(n) }));
      const sorted = [...encoded].sort((a, b) => a.e.localeCompare(b.e));

      expect(sorted.map(x => x.n)).toEqual(numbers);
    });

    it('should maintain order for decimal numbers', () => {
      const numbers = [-1.5, -0.5, 0, 0.5, 1.5, 2.5];
      const encoded = numbers.map(n => ({ n, e: fpEncode(n) }));
      const sorted = [...encoded].sort((a, b) => a.e.localeCompare(b.e));

      expect(sorted.map(x => x.n)).toEqual(numbers);
    });

    it('should maintain order for mixed integers and decimals', () => {
      const numbers = [-10, -1.5, -1, 0, 0.5, 1, 1.5, 10];
      const encoded = numbers.map(n => ({ n, e: fpEncode(n) }));
      const sorted = [...encoded].sort((a, b) => a.e.localeCompare(b.e));

      expect(sorted.map(x => x.n)).toEqual(numbers);
    });
  });
});
