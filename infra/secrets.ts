/**
 * SST Secrets for sensitive configuration
 */

// Dexcom Share API credentials
export const dexcomUsername = new sst.Secret("DexcomUsername");
export const dexcomPassword = new sst.Secret("DexcomPassword");

// Oura Ring OAuth credentials
export const ouraClientId = new sst.Secret("OuraClientId");
export const ouraClientSecret = new sst.Secret("OuraClientSecret");

// Glooko web scraper credentials
export const glookoEmail = new sst.Secret("GlookoEmail");
export const glookoPassword = new sst.Secret("GlookoPassword");
