#!/usr/bin/env node
/**
 * Signage Relay CLI
 *
 * Connects to AWS WebSocket API and relays frames to local Pixoo device
 *
 * Usage:
 *   pnpm relay --pixoo 192.168.1.100 --ws wss://xxx.execute-api.us-east-1.amazonaws.com/prod
 */

import { program } from "commander";
import { startRelay } from "./relay";

program
  .name("signage-relay")
  .description("Relay frames from AWS to local Pixoo device")
  .version("0.1.0")
  .requiredOption("--pixoo <ip>", "Pixoo device IP address")
  .requiredOption("--ws <url>", "WebSocket API URL")
  .option("--terminal <id>", "Terminal ID to register as")
  .action(async (options) => {
    console.log("Starting Signage Relay...");
    console.log(`  Pixoo: ${options.pixoo}`);
    console.log(`  WebSocket: ${options.ws}`);
    if (options.terminal) {
      console.log(`  Terminal ID: ${options.terminal}`);
    }

    try {
      await startRelay({
        pixooIp: options.pixoo,
        wsUrl: options.ws,
        terminalId: options.terminal,
      });
    } catch (error) {
      console.error("Relay error:", error);
      process.exit(1);
    }
  });

program.parse();
