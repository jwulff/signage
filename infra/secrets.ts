/**
 * SST Secrets for sensitive configuration
 */

// Dexcom Share API credentials
export const dexcomUsername = new sst.Secret("DexcomUsername");
export const dexcomPassword = new sst.Secret("DexcomPassword");
