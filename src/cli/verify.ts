#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import { URL } from "url";
import * as dotenv from "dotenv";

console.log("🔍 Cypress Snapshot Bug Reporter — Setup Verification");
console.log("======================================================");

const envPath = path.join(process.cwd(), ".env");
const envExists = fs.existsSync(envPath);

let hasErrors = false;
const errors: string[] = [];

if (envExists) {
  console.log("  ✅ .env file found");
  dotenv.config({ path: envPath });
} else {
  console.log(
    "  ❌ .env file missing — please create one in the root directory",
  );
  hasErrors = true;
  errors.push(".env file missing");
}

const provider = process.env.AI_PROVIDER || "";
if (
  provider === "google" ||
  provider === "openai" ||
  provider === "anthropic"
) {
  console.log(`  ✅ AI_PROVIDER: ${provider}`);
} else {
  console.log(
    `  ❌ AI_PROVIDER: missing or invalid (should be google, openai, or anthropic)`,
  );
  hasErrors = true;
  errors.push("AI_PROVIDER invalid");
}

const model = process.env.AI_MODEL || "";
if (model.trim() !== "") {
  console.log(`  ✅ AI_MODEL: ${model}`);
} else {
  console.log(`  ❌ AI_MODEL: missing`);
  hasErrors = true;
  errors.push("AI_MODEL missing");
}

const endpoint = process.env.AI_ENDPOINT || "";
if (endpoint.startsWith("https://")) {
  console.log(`  ✅ AI_ENDPOINT: configured`);
} else {
  console.log(
    `  ❌ AI_ENDPOINT: missing or invalid (must start with https://)`,
  );
  hasErrors = true;
  errors.push("AI_ENDPOINT invalid");
}

const apiKey = process.env.AI_API_KEY || "";
let firstKey = "";
if (apiKey.trim() !== "" && !apiKey.includes("PASTE_YOUR_KEY_HERE")) {
  const keys = apiKey
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k !== "");
  firstKey = keys[0] || "";
  if (keys.length > 0) {
    console.log(
      `  ✅ AI_API_KEY: configured (${keys.length} key${keys.length > 1 ? "s" : ""})`,
    );
  } else {
    console.log(`  ❌ AI_API_KEY: missing`);
    hasErrors = true;
    errors.push("AI_API_KEY missing");
  }
} else {
  console.log(
    `  ❌ AI_API_KEY: missing — open .env and replace PASTE_YOUR_KEY_HERE`,
  );
  hasErrors = true;
  errors.push("AI_API_KEY missing");
}

async function testConnection(): Promise<void> {
  if (hasErrors) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let urlString = endpoint;
    const options: https.RequestOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    };
    let payload = "";

    if (provider === "google") {
      urlString = `${endpoint}?key=${firstKey}`;
      payload = JSON.stringify({ contents: [{ parts: [{ text: "test" }] }] });
    } else if (provider === "openai") {
      (options.headers as Record<string, string>)["Authorization"] =
        `Bearer ${firstKey}`;
      payload = JSON.stringify({
        model: model,
        messages: [{ role: "user", content: "test" }],
        max_tokens: 1,
      });
    } else if (provider === "anthropic") {
      (options.headers as Record<string, string>)["x-api-key"] = firstKey;
      (options.headers as Record<string, string>)["anthropic-version"] =
        "2023-06-01";
      payload = JSON.stringify({
        model: model,
        messages: [{ role: "user", content: "test" }],
        max_tokens: 1,
      });
    }

    const parsedUrl = new URL(urlString);
    options.hostname = parsedUrl.hostname;
    options.path = parsedUrl.pathname + parsedUrl.search;
    options.port = parsedUrl.port || 443;

    const req = https.request(options, (res) => {
      const statusCode = res.statusCode || 0;
      if (statusCode >= 200 && statusCode < 300) {
        console.log(`  ✅ API connection test: success`);
      } else {
        console.log(`  ❌ API connection test: failed (Status ${statusCode})`);
        hasErrors = true;
      }
      res.on("data", () => {}); // Consume data
      res.on("end", () => resolve());
    });

    req.on("error", (e) => {
      console.log(`  ⚠️ API connection test: network error (${e.message})`);
      // Don't fail completely on network error
      resolve();
    });

    req.write(payload);
    req.end();
  });
}

testConnection().then(() => {
  console.log("======================================================");
  if (!hasErrors) {
    console.log("  🎉 You're all set! Run your tests with: npx cypress run");
  } else {
    console.log("  ❌ Setup verification failed. Please fix the issues above.");
  }
});
