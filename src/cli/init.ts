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
  let defaultModel = "";
  let defaultEndpoint = "";
  let providerDisplay = "";

  while (true) {
    const answer = await question(
      "Which AI provider do you want to configure? (google/openai/anthropic/skip): ",
    );
    const lowerAnswer = answer.toLowerCase().trim();

    if (lowerAnswer === "skip") {
      break;
    }

    if (lowerAnswer === "google" || lowerAnswer === "gemini") {
      selectedProvider = "google";
      providerDisplay = "Google Gemini";
      defaultModel = "gemini-1.5-flash";
      defaultEndpoint =
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";
      break;
    } else if (lowerAnswer === "openai") {
      selectedProvider = "openai";
      providerDisplay = "OpenAI";
      defaultModel = "gpt-4o";
      defaultEndpoint = "https://api.openai.com/v1/chat/completions";
      break;
    } else if (lowerAnswer === "anthropic") {
      selectedProvider = "anthropic";
      providerDisplay = "Anthropic Claude";
      defaultModel = "claude-3-5-sonnet-20241022";
      defaultEndpoint = "https://api.anthropic.com/v1/messages";
      break;
    } else {
      console.log(
        "Invalid option. Please enter google, openai, anthropic, or skip.",
      );
    }
  }

  if (selectedProvider) {
    const apiKey = await question(
      `Enter your ${providerDisplay} API key (or multiple keys separated by commas for rotation): `,
    );

    if (apiKey.trim()) {
      // Helper to replace or append env vars
      const upsertEnv = (key: string, value: string) => {
        const regex = new RegExp(`^${key}=.*$`, "m");
        if (regex.test(envContent)) {
          envContent = envContent.replace(regex, `${key}=${value}`);
          console.log(`Updated ${key}`);
        } else {
          envContent += `\n${key}=${value}`;
          console.log(`Added ${key}`);
        }
      };

      console.log("\nConfiguring .env...");
      upsertEnv("AI_PROVIDER", selectedProvider);
      upsertEnv("AI_MODEL", defaultModel);
      upsertEnv("AI_ENDPOINT", defaultEndpoint);
      upsertEnv("AI_API_KEY", apiKey.trim());

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
