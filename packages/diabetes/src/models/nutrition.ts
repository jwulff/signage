/**
 * Nutrition record types - carbs and food logging
 */

import type { BaseRecord } from "./base.js";

/**
 * Standalone carb entry (not associated with a bolus)
 * Source: carbs_data_1.csv
 */
export interface CarbsRecord extends BaseRecord {
  type: "carbs";
  /** Carbohydrates in grams */
  carbsGrams: number;
}

/**
 * Detailed food log entry
 * Source: food_data_1.csv
 */
export interface FoodRecord extends BaseRecord {
  type: "food";
  /** Food name/description */
  name: string;
  /** Carbohydrates in grams */
  carbsGrams?: number;
  /** Fat in grams */
  fatGrams?: number;
  /** Protein in grams */
  proteinGrams?: number;
  /** Calories */
  calories?: number;
  /** Serving size quantity */
  servingQuantity?: number;
  /** Number of servings */
  numberOfServings?: number;
}

/**
 * Union of all nutrition record types
 */
export type NutritionRecord = CarbsRecord | FoodRecord;
