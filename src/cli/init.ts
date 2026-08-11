#!/usr/bin/env node

import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query: string): Promise<string> => {
  return new Promise((resolve) => rl.question(query, resolve));
};

async function runInit() {
  console.log("\n======================================================");
  console.log("🤖 Cypress Snapshot Bug Reporter Setup");
  console.log("======================================================\n");

  console.log(
    "This utility will help you configure your AI provider API keys.",
  );
  console.log("The keys will be saved to a .env file in your project root.\n");

  const envFilePath = path.join(process.cwd(), ".env");
  let envContent = "";

  if (fs.existsSync(envFilePath)) {
    console.log(`Found existing .env file at ${envFilePath}`);
    envContent = fs.readFileSync(envFilePath, "utf8");
  } else {
    console.log("Creating a new .env file...");
  }

  let selectedProvider = "";

  while (true) {
    const answer = await question(
      "Which AI provider do you want to configure? (openai/anthropic/gemini/skip): ",
    );
    const lowerAnswer = answer.toLowerCase().trim();

    if (lowerAnswer === "skip") {
      break;
    }

    if (lowerAnswer === "openai") {
      selectedProvider = "OPENAI_API_KEY";
      break;
    } else if (lowerAnswer === "anthropic") {
      selectedProvider = "ANTHROPIC_API_KEY";
      break;
    } else if (lowerAnswer === "gemini") {
      selectedProvider = "GEMINI_API_KEY";
      break;
    } else {
      console.log(
        "Invalid option. Please enter openai, anthropic, gemini, or skip.",
      );
    }
  }

  if (selectedProvider) {
    const apiKey = await question(
      `Enter your ${selectedProvider.split("_")[0]} API key (or multiple keys separated by commas for rotation): `,
    );

    if (apiKey.trim()) {
      const envRegex = new RegExp(`^${selectedProvider}=.*$`, "m");
      if (envRegex.test(envContent)) {
        envContent = envContent.replace(
          envRegex,
          `${selectedProvider}=${apiKey.trim()}`,
        );
        console.log(`\nUpdated ${selectedProvider} in .env file.`);
      } else {
        envContent += `\n${selectedProvider}=${apiKey.trim()}\n`;
        console.log(`\nAdded ${selectedProvider} to .env file.`);
      }

      fs.writeFileSync(envFilePath, envContent.trim() + "\n", "utf8");
    } else {
      console.log("\nNo API key provided. Skipping.");
    }
  }

  console.log("\n======================================================");
  console.log("✅ Setup Complete!");
  console.log("======================================================");
  console.log(
    "You can now run your visual regression tests with AI bug reporting.",
  );

  rl.close();
}

runInit().catch((err) => {
  console.error("An error occurred during setup:", err);
  rl.close();
  process.exit(1);
});
