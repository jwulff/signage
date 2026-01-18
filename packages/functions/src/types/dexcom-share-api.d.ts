/**
 * Type declarations for dexcom-share-api
 * @see https://github.com/aud/dexcom-share-api
 */
declare module "dexcom-share-api" {
  export interface DexcomClientOptions {
    username: string;
    password: string;
    /** "us" for United States, "eu" for all other countries including Canada */
    server: "us" | "eu";
  }

  export interface GetEstimatedGlucoseValuesOptions {
    /** Maximum number of readings to retrieve (default: 1) */
    maxCount?: number;
    /** Minutes to look back (default: 1440 = 24 hours) */
    minutes?: number;
  }

  export interface GlucoseReading {
    /** Glucose value in mmol/L */
    mmol: number;
    /** Glucose value in mg/dL */
    mgdl: number;
    /** Trend direction (e.g., "Flat", "SingleUp", "FortyFiveDown") */
    trend: string;
    /** Unix timestamp in milliseconds */
    timestamp: number;
  }

  export class DexcomClient {
    constructor(options: DexcomClientOptions);

    /**
     * Fetch estimated glucose values from Dexcom Share
     * @param options Optional parameters for the query
     * @returns Array of glucose readings, most recent first
     */
    getEstimatedGlucoseValues(
      options?: GetEstimatedGlucoseValuesOptions
    ): Promise<GlucoseReading[]>;
  }
}
