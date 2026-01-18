/**
 * Pixoo device discovery via local subnet scan
 */

import { networkInterfaces } from "os";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export interface PixooDevice {
  name: string;
  ip: string;
}

const CONFIG_DIR = join(homedir(), ".signage");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

interface Config {
  pixooIp?: string;
}

/**
 * Load saved config
 */
export function loadConfig(): Config {
  try {
    const data = readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

/**
 * Save config
 */
export function saveConfig(config: Config): void {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error("Failed to save config:", error);
  }
}

/**
 * Get saved Pixoo IP
 */
export function getSavedPixooIp(): string | undefined {
  return loadConfig().pixooIp;
}

/**
 * Save Pixoo IP for future use
 */
export function savePixooIp(ip: string): void {
  const config = loadConfig();
  config.pixooIp = ip;
  saveConfig(config);
}

/**
 * Get local subnet
 */
function getLocalSubnet(): string | null {
  const interfaces = networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address.split(".").slice(0, 3).join(".");
      }
    }
  }
  return null;
}

/**
 * Check if an IP hosts a Pixoo device
 */
async function probePixoo(ip: string): Promise<PixooDevice | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 500);

  try {
    const response = await fetch(`http://${ip}:80/post`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ Command: "Channel/GetIndex" }),
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const data = (await response.json()) as { error_code?: number };
    if (data?.error_code === 0) {
      return { name: "Pixoo", ip };
    }
  } catch {
    // Not a Pixoo
  } finally {
    clearTimeout(timeoutId);
  }
  return null;
}

/**
 * Scan local subnet for Pixoo devices
 */
export async function scanForDevices(
  onProgress?: (current: number, total: number) => void
): Promise<PixooDevice[]> {
  const subnet = getLocalSubnet();
  if (!subnet) {
    throw new Error("Could not determine local network");
  }

  const devices: PixooDevice[] = [];
  const batchSize = 50;

  for (let start = 1; start <= 254; start += batchSize) {
    const promises: Promise<PixooDevice | null>[] = [];

    for (let i = start; i < start + batchSize && i <= 254; i++) {
      promises.push(probePixoo(`${subnet}.${i}`));
    }

    const results = await Promise.all(promises);
    devices.push(...results.filter((d): d is PixooDevice => d !== null));

    onProgress?.(Math.min(start + batchSize - 1, 254), 254);
  }

  return devices;
}
