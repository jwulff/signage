#!/usr/bin/env node
/**
 * Signage Relay CLI
 */

import { program } from "commander";
import { createInterface } from "readline";
import { startRelay } from "./relay";
import { scanForDevices, getSavedPixooIp, savePixooIp } from "./discovery";

/**
 * Prompt user for yes/no
 */
function confirm(question: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${question} (y/n) `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().startsWith("y"));
    });
  });
}

/**
 * Prompt user to select from list
 */
function selectFromList(items: string[], prompt: string): Promise<number> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(prompt);
  items.forEach((item, i) => console.log(`  ${i + 1}. ${item}`));

  return new Promise((resolve) => {
    rl.question("Enter number: ", (answer) => {
      rl.close();
      const num = parseInt(answer, 10);
      resolve(num >= 1 && num <= items.length ? num - 1 : 0);
    });
  });
}

/**
 * Get Pixoo IP - from arg, saved config, or scan
 */
async function getPixooIp(providedIp?: string): Promise<string | null> {
  // 1. Use provided IP
  if (providedIp) {
    savePixooIp(providedIp);
    return providedIp;
  }

  // 2. Use saved IP
  const savedIp = getSavedPixooIp();
  if (savedIp) {
    console.log(`Using saved Pixoo IP: ${savedIp}`);
    console.log(`(Run with --pixoo <ip> to change)\n`);
    return savedIp;
  }

  // 3. Ask to scan
  console.log("No Pixoo IP configured.\n");
  const shouldScan = await confirm("Scan network for Pixoo devices?");

  if (!shouldScan) {
    console.log("\nRun with --pixoo <ip> to specify device.");
    return null;
  }

  // 4. Scan
  console.log("\nScanning network...");
  const devices = await scanForDevices((current, total) => {
    process.stdout.write(`\r  Progress: ${current}/${total}`);
  });
  console.log("\n");

  if (devices.length === 0) {
    console.log("No Pixoo devices found.");
    console.log("Make sure your Pixoo is on and connected to WiFi.");
    return null;
  }

  // 5. Select device
  let selectedIp: string;
  if (devices.length === 1) {
    selectedIp = devices[0].ip;
    console.log(`Found: ${devices[0].ip}`);
  } else {
    const idx = await selectFromList(
      devices.map((d) => d.ip),
      `Found ${devices.length} devices:`
    );
    selectedIp = devices[idx].ip;
  }

  // 6. Save for next time
  savePixooIp(selectedIp);
  console.log(`Saved ${selectedIp} to ~/.signage/config.json\n`);

  return selectedIp;
}

program
  .name("signage-relay")
  .description("Relay frames from AWS to local Pixoo device")
  .version("0.1.0")
  .option("--pixoo <ip>", "Pixoo device IP address")
  .requiredOption("--ws <url>", "WebSocket API URL")
  .option("--terminal <id>", "Terminal ID to register as")
  .action(async (options) => {
    const pixooIp = await getPixooIp(options.pixoo);

    if (!pixooIp) {
      process.exit(1);
    }

    console.log("Starting Signage Relay...");
    console.log(`  Pixoo: ${pixooIp}`);
    console.log(`  WebSocket: ${options.ws}`);
    if (options.terminal) {
      console.log(`  Terminal ID: ${options.terminal}`);
    }
    console.log();

    try {
      await startRelay({
        pixooIp,
        wsUrl: options.ws,
        terminalId: options.terminal,
      });
    } catch (error) {
      console.error("Relay error:", error);
      process.exit(1);
    }
  });

// Scan command for manual discovery
program
  .command("scan")
  .description("Scan network for Pixoo devices")
  .action(async () => {
    console.log("Scanning network for Pixoo devices...\n");

    const devices = await scanForDevices((current, total) => {
      process.stdout.write(`\r  Progress: ${current}/${total}`);
    });
    console.log("\n");

    if (devices.length === 0) {
      console.log("No Pixoo devices found.");
    } else {
      console.log(`Found ${devices.length} device(s):`);
      devices.forEach((d) => console.log(`  - ${d.ip}`));
    }
  });

// Clear saved config
program
  .command("forget")
  .description("Forget saved Pixoo IP")
  .action(() => {
    const savedIp = getSavedPixooIp();
    if (savedIp) {
      savePixooIp("");
      console.log(`Forgot saved IP: ${savedIp}`);
    } else {
      console.log("No saved IP to forget.");
    }
  });

program.parse();
