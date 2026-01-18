/**
 * Interactive Setup for Local Development
 * Prompts for widget credentials on first run, saves to .env.local
 */

import { createInterface } from "readline";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

// Path to the env file (in repo root)
const ENV_FILE = join(import.meta.dirname, "../../../.env.local");

export interface LocalConfig {
  // Dexcom credentials for blood sugar widget
  dexcomUsername?: string;
  dexcomPassword?: string;
}

/**
 * Load existing config from .env.local
 */
export function loadConfig(): LocalConfig {
  if (!existsSync(ENV_FILE)) {
    return {};
  }

  const content = readFileSync(ENV_FILE, "utf-8");
  const config: LocalConfig = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const [key, ...valueParts] = trimmed.split("=");
    const value = valueParts.join("="); // Handle values with = in them

    switch (key) {
      case "DEXCOM_USERNAME":
        config.dexcomUsername = value;
        break;
      case "DEXCOM_PASSWORD":
        config.dexcomPassword = value;
        break;
    }
  }

  return config;
}

/**
 * Save config to .env.local
 */
function saveConfig(config: LocalConfig): void {
  const lines: string[] = [
    "# Local Development Configuration",
    "# This file is gitignored - do not commit credentials",
    "",
    "# Dexcom Share API credentials (for blood sugar widget)",
    "# Create a follower account at https://www.dexcom.com/share",
  ];

  if (config.dexcomUsername) {
    lines.push(`DEXCOM_USERNAME=${config.dexcomUsername}`);
  }
  if (config.dexcomPassword) {
    lines.push(`DEXCOM_PASSWORD=${config.dexcomPassword}`);
  }

  lines.push(""); // Trailing newline
  writeFileSync(ENV_FILE, lines.join("\n"));
}

/**
 * Create readline interface for prompts
 */
function createPrompt(): {
  ask: (question: string) => Promise<string>;
  askHidden: (question: string) => Promise<string>;
  close: () => void;
} {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return {
    ask: (question: string) =>
      new Promise((resolve) => {
        rl.question(question, resolve);
      }),
    askHidden: (question: string) =>
      new Promise((resolve) => {
        // For password input, we'll use a simple approach
        // In a real app, you'd want to hide input properly
        process.stdout.write(question);
        let input = "";

        const stdin = process.stdin;
        const wasRaw = stdin.isRaw;

        if (stdin.isTTY) {
          stdin.setRawMode(true);
        }
        stdin.resume();
        stdin.setEncoding("utf8");

        const onData = (char: string) => {
          switch (char) {
            case "\n":
            case "\r":
            case "\u0004": // Ctrl+D
              stdin.removeListener("data", onData);
              if (stdin.isTTY) {
                stdin.setRawMode(wasRaw ?? false);
              }
              process.stdout.write("\n");
              resolve(input);
              break;
            case "\u0003": // Ctrl+C
              process.exit();
              break;
            case "\u007F": // Backspace
              if (input.length > 0) {
                input = input.slice(0, -1);
                process.stdout.write("\b \b");
              }
              break;
            default:
              input += char;
              process.stdout.write("*");
          }
        };

        stdin.on("data", onData);
      }),
    close: () => rl.close(),
  };
}

/**
 * Run interactive setup if needed
 */
export async function runSetup(): Promise<LocalConfig> {
  const existing = loadConfig();

  // Check if we have Dexcom credentials
  const hasDexcom = existing.dexcomUsername && existing.dexcomPassword;

  if (hasDexcom) {
    console.log("Loaded credentials from .env.local");
    return existing;
  }

  // No credentials - ask user what they want to do
  console.log("\n┌─────────────────────────────────────────┐");
  console.log("│     Local Development Setup             │");
  console.log("└─────────────────────────────────────────┘\n");

  if (!existsSync(ENV_FILE)) {
    console.log("No .env.local found. Let's set up your widget credentials.\n");
  } else {
    console.log("Some credentials are missing. Let's complete the setup.\n");
  }

  const prompt = createPrompt();

  try {
    // Dexcom setup
    console.log("─── Blood Sugar Widget (Dexcom) ───");
    console.log("To show real blood sugar data, you need Dexcom Share credentials.");
    console.log("You can skip this to use mock data instead.\n");

    const setupDexcom = await prompt.ask("Set up Dexcom credentials? (y/n): ");

    if (setupDexcom.toLowerCase().startsWith("y")) {
      console.log("\nEnter your Dexcom Share credentials:");
      console.log("(These are stored locally in .env.local and never committed)\n");

      existing.dexcomUsername = await prompt.ask("Dexcom username: ");
      existing.dexcomPassword = await prompt.askHidden("Dexcom password: ");

      if (existing.dexcomUsername && existing.dexcomPassword) {
        console.log("\n✓ Dexcom credentials saved");
      }
    } else {
      console.log("\n→ Skipping Dexcom setup (will use mock data)");
    }

    // Save whatever we collected
    saveConfig(existing);
    console.log(`\nConfiguration saved to .env.local`);
    console.log("You can edit this file directly or delete it to run setup again.\n");

    return existing;
  } finally {
    prompt.close();
  }
}

/**
 * Check if running in interactive terminal
 */
export function isInteractive(): boolean {
  return process.stdin.isTTY === true;
}
