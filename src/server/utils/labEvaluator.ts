import { AbnormalFlag } from '../../shared/types/index.js';

/**
 * Automatically evaluates diagnostic laboratory parameter values against normal reference ranges.
 * Identifies LOW, HIGH, CRITICAL_LOW, CRITICAL_HIGH, and qualitative ABNORMAL values.
 */
export function evaluateLabParameter(
  value: number | string,
  minNormal?: number,
  maxNormal?: number,
  textRange?: string,
): { isAbnormal: boolean; abnormalFlag: AbnormalFlag } {
  const num = typeof value === 'number' ? value : parseFloat(String(value));

  // Numerical evaluation
  if (
    typeof value === 'number' ||
    (!isNaN(num) && (minNormal !== undefined || maxNormal !== undefined))
  ) {
    if (minNormal !== undefined && num < minNormal) {
      const isCritical = num < minNormal * 0.6;
      return {
        isAbnormal: true,
        abnormalFlag: isCritical ? 'CRITICAL_LOW' : 'LOW',
      };
    }
    if (maxNormal !== undefined && num > maxNormal) {
      const isCritical = num > maxNormal * 1.5;
      return {
        isAbnormal: true,
        abnormalFlag: isCritical ? 'CRITICAL_HIGH' : 'HIGH',
      };
    }
    return { isAbnormal: false, abnormalFlag: 'NORMAL' };
  }

  // Qualitative text comparison (e.g., "Positive" vs "Negative")
  if (textRange) {
    const strVal = String(value).trim().toLowerCase();
    const strRef = textRange.trim().toLowerCase();
    if (strVal !== strRef) {
      return { isAbnormal: true, abnormalFlag: 'ABNORMAL' };
    }
  }

  return { isAbnormal: false, abnormalFlag: 'NORMAL' };
}
