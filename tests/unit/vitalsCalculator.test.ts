import { describe, it, expect } from 'vitest';
import {
  calculateBmi,
  getBmiCategory,
  getAbnormalVitalsFlags,
  enrichVitals,
} from '../../src/server/utils/vitalsCalculator.js';
import { IVitals } from '../../src/shared/types/index.js';

describe('Vitals and BMI Calculator Unit Tests (Day 11)', () => {
  describe('calculateBmi', () => {
    it('should correctly calculate BMI to one decimal place', () => {
      // 70 kg, 175 cm -> 70 / (1.75^2) = 22.857 -> 22.9
      expect(calculateBmi(70, 175)).toBe(22.9);
      // 95 kg, 180 cm -> 95 / (1.8^2) = 29.32 -> 29.3
      expect(calculateBmi(95, 180)).toBe(29.3);
    });

    it('should return 0 for non-positive dimensions', () => {
      expect(calculateBmi(0, 175)).toBe(0);
      expect(calculateBmi(70, 0)).toBe(0);
      expect(calculateBmi(-70, 175)).toBe(0);
    });
  });

  describe('getBmiCategory', () => {
    it('should classify < 18.5 as UNDERWEIGHT', () => {
      expect(getBmiCategory(17.2)).toBe('UNDERWEIGHT');
    });

    it('should classify 18.5 - 24.9 as NORMAL', () => {
      expect(getBmiCategory(18.5)).toBe('NORMAL');
      expect(getBmiCategory(22.4)).toBe('NORMAL');
      expect(getBmiCategory(24.9)).toBe('NORMAL');
    });

    it('should classify 25.0 - 29.9 as OVERWEIGHT', () => {
      expect(getBmiCategory(25.0)).toBe('OVERWEIGHT');
      expect(getBmiCategory(28.3)).toBe('OVERWEIGHT');
      expect(getBmiCategory(29.9)).toBe('OVERWEIGHT');
    });

    it('should classify >= 30.0 as OBESE', () => {
      expect(getBmiCategory(30.0)).toBe('OBESE');
      expect(getBmiCategory(36.5)).toBe('OBESE');
    });
  });

  describe('getAbnormalVitalsFlags', () => {
    it('should detect hypertension (high blood pressure)', () => {
      const flags = getAbnormalVitalsFlags({
        systolicBp: 145,
        diastolicBp: 95,
        pulseRate: 75,
        temperatureF: 98.6,
        respiratoryRate: 16,
        oxygenSaturation: 98,
      });
      expect(flags).toContain('HIGH_BLOOD_PRESSURE');
    });

    it('should detect hypotension (low blood pressure)', () => {
      const flags = getAbnormalVitalsFlags({
        systolicBp: 85,
        diastolicBp: 55,
        pulseRate: 75,
        temperatureF: 98.6,
        respiratoryRate: 16,
        oxygenSaturation: 98,
      });
      expect(flags).toContain('LOW_BLOOD_PRESSURE');
    });

    it('should detect tachycardia and fever', () => {
      const flags = getAbnormalVitalsFlags({
        systolicBp: 120,
        diastolicBp: 80,
        pulseRate: 115,
        temperatureF: 101.5,
        respiratoryRate: 18,
        oxygenSaturation: 98,
      });
      expect(flags).toContain('TACHYCARDIA');
      expect(flags).toContain('FEVER');
    });

    it('should detect hypoxia and tachypnea', () => {
      const flags = getAbnormalVitalsFlags({
        systolicBp: 120,
        diastolicBp: 80,
        pulseRate: 88,
        temperatureF: 98.6,
        respiratoryRate: 24,
        oxygenSaturation: 91,
      });
      expect(flags).toContain('HYPOXIA');
      expect(flags).toContain('TACHYPNEA');
    });

    it('should return empty flags when all vitals are normal', () => {
      const flags = getAbnormalVitalsFlags({
        systolicBp: 120,
        diastolicBp: 80,
        pulseRate: 72,
        temperatureF: 98.6,
        respiratoryRate: 16,
        oxygenSaturation: 99,
      });
      expect(flags).toHaveLength(0);
    });
  });

  describe('enrichVitals', () => {
    it('should enrich vitals object with bmi, category, and abnormal flags', () => {
      const raw: IVitals = {
        systolicBp: 150,
        diastolicBp: 95,
        pulseRate: 105,
        temperatureF: 98.6,
        respiratoryRate: 16,
        oxygenSaturation: 98,
        heightCm: 180,
        weightKg: 85,
      };

      const enriched = enrichVitals(raw);
      expect(enriched.bmi).toBe(26.2);
      expect(enriched.bmiCategory).toBe('OVERWEIGHT');
      expect(enriched.abnormalFlags).toContain('HIGH_BLOOD_PRESSURE');
      expect(enriched.abnormalFlags).toContain('TACHYCARDIA');
    });
  });
});
