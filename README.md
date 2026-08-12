# Cypress Snapshot Bug Reporter

> AI-Powered Visual Regression Testing & Bug Report Generator for Cypress

[![npm version](https://img.shields.io/npm/v/cypress-snapshot-bug-reporter.svg)](https://www.npmjs.com/package/cypress-snapshot-bug-reporter)
[![TypeScript](https://img.shields.io/badge/TypeScript-First-blue.svg)](https://www.typescriptlang.org/)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

## ✨ Key Features
- **AI-Powered Visual Analysis** with multimodal vision AI
- **Structured Location Hierarchy** (Section > Table > Row > Col)
- **Exact Value Extraction** (e.g., $169.80 → $173.50)
- **Automated Excel Bug Reports** (12-column styled `.xlsx`)
- **Zero Test Slowdown** (AI runs post-test via `after:run` hook)
- **Multi-Provider Support** (Google Gemini, OpenAI, Anthropic Claude)
- **Multi-API Key Rotation** (up to 4 backup keys)
- **TypeScript First**

## 📦 Installation

```bash
npm install --save-dev cypress-snapshot-bug-reporter
```

*Note: This automatically creates a `.env` file with sample AI configuration. Requirements: Node.js >= 18, Cypress >= 13.*

## 🚀 Quick Setup (4 steps)

### Step 1: Add Your API Key
Installation automatically creates a `.env` file in your project root. Open it and replace `PASTE_YOUR_KEY_HERE` with your actual API key.

By default, Google Gemini is pre-selected. You can get a free Google Gemini key at [Google AI Studio](https://aistudio.google.com/).

To switch to OpenAI or Anthropic, simply comment out the Google block and uncomment the block for your preferred provider.

**For multiple backup keys (automatic rotation):**
```env
AI_API_KEY=key1,key2,key3,key4
```

### Step 2: Configure Plugin
Update your `cypress.config.js` or `cypress.config.ts`:

```javascript
const { defineConfig } = require("cypress");
const { configSnapshot } = require("cypress-snapshot-bug-reporter/plugin");

module.exports = defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      return configSnapshot(on, config);
    },
  },
});
```

> **Note:** The plugin automatically loads your `.env` file — no need to install or configure `dotenv` yourself.

### Step 3: Import Commands
Add the following to your Cypress support file (e.g., `cypress/support/e2e.js` or `cypress/support/e2e.ts`):

```javascript
import "cypress-snapshot-bug-reporter/commands";
```

### Step 4: Verify Setup
Run the built-in verification tool to ensure everything is configured correctly:

```bash
npx cypress-snapshot-verify
```
*Expected output: A list of green checkmarks confirming your configuration, directories, and API keys are valid.*

## 💻 Usage

Use the `cy.matchImageSnapshot()` command in your tests to take snapshots.

**Basic Usage:**
```javascript
it('should render the homepage correctly', () => {
  cy.visit('/');
  cy.matchImageSnapshot('homepage');
});
```

**Component Snapshot:**
```javascript
it('should render the pricing table correctly', () => {
  cy.visit('/pricing');
  cy.get('.pricing-table').matchImageSnapshot('pricing-table');
});
```

**Advanced Options:**
```javascript
it('should handle advanced snapshot options', () => {
  cy.matchImageSnapshot('custom-snapshot', {
    failureThreshold: 0.05,
    failureThresholdType: 'percent',
    capture: 'fullPage'
  });
});
```

## ⚙️ How It Works

The plugin operates in a simple 2-run flow:
1. **First Run**: Creates baseline snapshots (your source of truth).
2. **Second Run**: Compares current UI against baselines, generates visual diff images, runs AI analysis on failures, and automatically creates a detailed Excel report.

## 📊 AI-Generated Reports

When tests fail, the AI generates a beautifully styled 12-column Excel report (`.xlsx`) containing:

| Column | Description |
|--------|-------------|
| **Bug ID** | Unique identifier for the bug |
| **Status** | Open/Closed status |
| **Severity** | AI-assessed severity (e.g., High, Medium, Low) |
| **Test Name** | Name of the failed snapshot |
| **Location** | Hierarchical location (Section > Table > Row > Col) |
| **Issue Type** | Type of visual regression (e.g., Content, Layout, Style) |
| **Expected** | The expected value/appearance (e.g., $169.80) |
| **Actual** | The actual value/appearance (e.g., $173.50) |
| **Description** | Detailed explanation of the difference |
| **Browser** | Browser used during the test |
| **Viewport** | Screen dimensions |
| **Diff Path** | Path to the generated diff image |

To trigger the AI analysis manually (if skipped during the test run), you can run:
```bash
npx cypress-snapshot-bug-reporter
```

## 🤖 AI Provider Setup

You can use any of the major AI providers:
- **Google Gemini (Default)**: Fast and highly accurate. Get a key at [Google AI Studio](https://aistudio.google.com/).
- **OpenAI (GPT-4o)**: Excellent multimodal reasoning. Get a key at [OpenAI Platform](https://platform.openai.com/).
- **Anthropic (Claude 3.5 Sonnet)**: Highly detailed analysis. Get a key at [Anthropic Console](https://console.anthropic.com/).

**Alternative setup method:**
Run the interactive CLI wizard to configure your provider:
```bash
npx cypress-snapshot-init
```

## 🔄 Multi-API Key Rotation

To avoid rate limits, you can provide multiple comma-separated keys in your `.env` file (`AI_API_KEY=key1,key2,key3,key4`). The plugin will automatically rotate to the next key upon encountering 429 (Rate Limit), 401, or 403 errors, ensuring your CI pipelines don't fail due to API quotas.

## 🛠 Configuration Options

You can pass an optional configuration object to `configSnapshot` in your `cypress.config.js`:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `snapshotOcrMode` | `boolean` | `true` | Enable OCR/AI parsing of diffs |
| `baselineDir` | `string` | `'cypress/snapshots/base'` | Directory for baseline images |
| `actualDir` | `string` | `'cypress/snapshots/actual'` | Directory for current run images |
| `diffDir` | `string` | `'cypress/snapshots/diff'` | Directory for diff images |
| `excelFile` | `string` | `'cypress/reports/bugs.xlsx'` | Path for the generated report |

## 🟦 TypeScript Support

The plugin includes built-in TypeScript definitions.

```typescript
// cypress/support/e2e.ts
import "cypress-snapshot-bug-reporter/commands";

// cypress.config.ts
import { defineConfig } from "cypress";
import { configSnapshot } from "cypress-snapshot-bug-reporter/plugin";

export default defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      return configSnapshot(on, config);
    },
  },
});
```

## 📂 Project Structure

After setup and running tests, your structure will look like this:
```
your-project/
├── .env
├── cypress.config.js
├── cypress/
│   ├── reports/
│   │   └── bugs.xlsx            # Generated Excel Report
│   └── snapshots/
│       ├── base/                # Baseline images
│       ├── actual/              # Current run images (if failed)
│       └── diff/                # Highlighted diff images
```

## 🚑 Troubleshooting

- **Screenshots blank/cropped**: Ensure the page has fully loaded before taking the snapshot. Try increasing the `viewportWidth` and `viewportHeight` in `cypress.config.js`.
- **AI analysis not running**: Check your `.env` file to ensure the API key is valid. Run `npx cypress-snapshot-verify` to diagnose issues.
- **Rate limiting**: Provide multiple comma-separated keys in `.env` or adjust `AI_REGION_DELAY_MS` if using region-based routing.
- **`matchImageSnapshot` not found**: Make sure `import "cypress-snapshot-bug-reporter/commands";` is in your `cypress/support/e2e.js` file.

## 💬 Getting Help

- **GitHub Discussions**: [https://github.com/Docode072/cypress-snapshot-bug-reporter/discussions](https://github.com/Docode072/cypress-snapshot-bug-reporter/discussions)
- **Issue Tracker**: [https://github.com/Docode072/cypress-snapshot-bug-reporter/issues](https://github.com/Docode072/cypress-snapshot-bug-reporter/issues)

## 📜 License

ISC License © 2026 Himanshu Singh

Made with ❤️ for the Cypress community
