import { IVitals, VitalsBmiCategory } from '../../shared/types/index.js';

export function calculateBmi(weightKg: number, heightCm: number): number {
  if (heightCm <= 0 || weightKg <= 0) {
    return 0;
  }
  const heightM = heightCm / 100;
  const rawBmi = weightKg / (heightM * heightM);
  return Math.round(rawBmi * 10) / 10;
}

export function getBmiCategory(bmi: number): VitalsBmiCategory {
  if (bmi < 18.5) {
    return 'UNDERWEIGHT';
  }
  if (bmi < 25.0) {
    return 'NORMAL';
  }
  if (bmi < 30.0) {
    return 'OVERWEIGHT';
  }
  return 'OBESE';
}

export function getAbnormalVitalsFlags(vitals: {
  systolicBp: number;
  diastolicBp: number;
  pulseRate: number;
  temperatureF: number;
  respiratoryRate: number;
  oxygenSaturation: number;
}): string[] {
  const flags: string[] = [];

  // Blood Pressure
  if (vitals.systolicBp >= 140 || vitals.diastolicBp >= 90) {
    flags.push('HIGH_BLOOD_PRESSURE');
  } else if (vitals.systolicBp < 90 || vitals.diastolicBp < 60) {
    flags.push('LOW_BLOOD_PRESSURE');
  }

  // Heart Rate / Pulse
  if (vitals.pulseRate > 100) {
    flags.push('TACHYCARDIA');
  } else if (vitals.pulseRate < 60) {
    flags.push('BRADYCARDIA');
  }

  // Temperature (Fahrenheit)
  if (vitals.temperatureF >= 100.4) {
    flags.push('FEVER');
  } else if (vitals.temperatureF < 95.0) {
    flags.push('HYPOTHERMIA');
  }

  // Respiratory Rate
  if (vitals.respiratoryRate > 20) {
    flags.push('TACHYPNEA');
  } else if (vitals.respiratoryRate < 12) {
    flags.push('BRADYPNEA');
  }

  // Oxygen Saturation (SpO2)
  if (vitals.oxygenSaturation < 95) {
    flags.push('HYPOXIA');
  }

  return flags;
}

export function enrichVitals(vitals: IVitals): IVitals {
  const bmi = calculateBmi(vitals.weightKg, vitals.heightCm);
  const bmiCategory = getBmiCategory(bmi);
  const abnormalFlags = getAbnormalVitalsFlags(vitals);

  return {
    ...vitals,
    bmi,
    bmiCategory,
    abnormalFlags,
  };
}
