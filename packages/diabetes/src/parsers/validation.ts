/**
 * Medical value validation for diabetes data
 */

/**
 * Physiological limits for medical values
 */
export const VALIDATION = {
  GLUCOSE_MIN: 20,
  GLUCOSE_MAX: 600,
  INSULIN_BOLUS_MAX: 100,
  INSULIN_BASAL_RATE_MAX: 10,
  CARBS_MAX: 500,
} as const;

/**
 * Validate glucose value is within physiological range
 */
export function isValidGlucose(value: number): boolean {
  return value >= VALIDATION.GLUCOSE_MIN && value <= VALIDATION.GLUCOSE_MAX;
}

/**
 * Validate insulin bolus is within reasonable range
 */
export function isValidInsulinBolus(value: number): boolean {
  return value > 0 && value <= VALIDATION.INSULIN_BOLUS_MAX;
}

/**
 * Validate basal rate is within reasonable range
 */
export function isValidBasalRate(value: number): boolean {
  return value >= 0 && value <= VALIDATION.INSULIN_BASAL_RATE_MAX;
}

/**
 * Validate carbs value is within reasonable range
 */
export function isValidCarbs(value: number): boolean {
  return value > 0 && value <= VALIDATION.CARBS_MAX;
}
