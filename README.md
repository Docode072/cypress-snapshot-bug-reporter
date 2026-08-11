# Cypress Snapshot Bug Reporter

> **AI-Powered Visual Regression Testing & Bug Report Generator for Cypress**  
> Automatically detect visual regressions, identify UI component hierarchies, extract exact baseline vs actual values, and export comprehensive Excel bug reports using AI models (OpenAI, Anthropic, Google Gemini, or Custom API endpoints).

[![npm version](https://badge.fury.io/js/cypress-snapshot-bug-reporter.svg)](https://badge.fury.io/js/cypress-snapshot-bug-reporter)
[![TypeScript](https://badges.frapsoft.com/typescript/code/typescript.svg?v=101)](https://github.com/ellerbrock/typescript-badges/)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

---

## 🌟 Key Features

* 🤖 **AI-Powered Visual Analysis**: Replaces legacy OCR with advanced multimodal vision AI models to accurately analyze UI snapshot differences
* 📍 **Structured Location Hierarchy**: Pinpoints changes down to `Section > Table Name > Row N (Label) > Col N (Header)`  
* 🎯 **Exact Value Extraction**: Extracts the exact changed number, text, color, or component (e.g., `$169.80` → `$173.50`) rather than dumping full rows
* 📊 **Automated Excel Bug Reports**: Generates a 12-column styled `.xlsx` bug report (`diff-report.xlsx`) with severity badges, change-type color coding, and confidence scores
* ⚡ **Zero Test Slowdown**: Visual pixel comparison runs during Cypress tests, while AI analysis executes post-run (`after:run` or via CLI) so your test suite stays fast  
* 🔌 **Multi-Provider Support**: Compatible with **Google Gemini**, **OpenAI**, **Anthropic Claude**, and custom OpenAI-compatible endpoints
* 🛡️ **TypeScript First**: Full TypeScript support with comprehensive type definitions

---

## 📦 Installation

```bash
npm install --save-dev cypress-snapshot-bug-reporter
```

**Requirements:** Node.js ≥ 18.0.0, Cypress ≥ 13.0.0

---

## ⚙️ Quick Setup

### 1. Configure Plugin (`cypress.config.js`)

```javascript
const { defineConfig } = require("cypress");
const { configSnapshot } = require("cypress-snapshot-bug-reporter/plugin");

module.exports = defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      return configSnapshot(on, config, {
        // Optional configuration:
        snapshotOcrMode: "after", // "after" (default) or "deferred" 
        baselineDir: "cypress/snapshots/baseline",
        actualDir: "cypress/snapshots/actual", 
        diffDir: "cypress/snapshots/diff",
        excelFile: "cypress/snapshots/reports/diff-report.xlsx",
      });
    },
  },
});
```

### 2. Import Commands (`cypress/support/e2e.js`)

```javascript
import "cypress-snapshot-bug-reporter/commands";
```

### 3. Set AI Provider Environment Variables

Choose your preferred AI provider. You can provide a **single API key**, or **multiple API keys separated by commas**. If you provide multiple keys, the plugin will seamlessly rotate to the next key if one hits a rate limit or runs out of quota.

**Google Gemini (Recommended)**
```bash
export AI_PROVIDER=google
export AI_MODEL=gemini-1.5-flash  
export AI_ENDPOINT=https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent
# Single key or comma-separated keys for automatic fallback:
export AI_API_KEY=your_gemini_api_key_1,your_gemini_api_key_2
```

**OpenAI**
```bash
export AI_PROVIDER=openai
export AI_MODEL=gpt-4o
export AI_ENDPOINT=https://api.openai.com/v1/chat/completions
export AI_API_KEY=sk-...,sk-...
```

**Anthropic Claude**  
```bash
export AI_PROVIDER=anthropic
export AI_MODEL=claude-3-5-sonnet-20241022
export AI_ENDPOINT=https://api.anthropic.com/v1/messages
export AI_API_KEY=sk-ant-...,sk-ant-...
```

---

## 🚀 Usage

### Basic Usage

```javascript
describe("Visual Regression Tests", () => {
  it("captures homepage snapshot", () => {
    cy.visit("/");
    cy.matchImageSnapshot("homepage");
  });

  it("captures specific component", () => {
    cy.get("[data-testid='navigation']").matchImageSnapshot("nav-component");
  });

  it("captures with options", () => {
    cy.matchImageSnapshot("dashboard", {
      threshold: 0.01,
      capture: "fullPage",
      baseViewport: { width: 1920, height: 1080 }
    });
  });
});
```

### Advanced Configuration

```javascript
cy.matchImageSnapshot("complex-form", {
  threshold: 0.02,              // 2% pixel difference tolerance
  ocrMode: "after",             // Run AI analysis automatically 
  capture: "viewport",          // "viewport" | "fullPage" | "runner"
  padding: 10,                  // Padding around element
  delay: 500,                   // Wait before capture
  failOnSnapshotDiff: true,     // Fail test on differences
  baseViewport: {               // Normalize viewport
    width: 1280,
    height: 800
  }
});
```

---

## 📊 AI-Generated Reports

When visual differences are detected, the plugin automatically generates a comprehensive Excel report (`diff-report.xlsx`) with 12 columns:

| Column | Description |
|---|---|
| **Severity** | Critical, High, Medium, or Low (based on pixel mismatch %) |
| **Snapshot Name** | Test spec name / snapshot identifier |
| **Content Type** | `Table`, `Text`, `Chart`, `Form`, `Card`, `Image` |
| **Location Path** | Hierarchical location (`Section > Table Name > Row N > Col N`) |
| **Baseline Value** | Exact baseline value, text, number, color, or component state |
| **Actual Value** | Exact actual value, text, number, color, or component state |
| **Change Type** | `value_changed`, `added`, `removed`, `color_changed`, `header_changed` |
| **Change Summary** | Human-readable AI summary of the visual bug |
| **All Changes** | Itemized breakdown of all individual field changes in the region |
| **AI Confidence** | Confidence score (0–100%) |
| **Analysis Source** | Provider tag (e.g. `ai-google`, `ai-openai`) |
| **Run Date** | Timestamp of report generation |

### Manual Analysis 

For deferred mode or on-demand analysis:

```bash
npx cypress-snapshot-bug-reporter
```

---

## 🔧 TypeScript Support

Full TypeScript support included:

```typescript
import type { 
  SnapshotOptions, 
  ComparisonResult,
  AIAnalysisResult 
} from 'cypress-snapshot-bug-reporter';

// Cypress namespace is automatically augmented
cy.matchImageSnapshot('typed-test', {
  threshold: 0.01,
  baseViewport: { width: 1920, height: 1080 }
});
```

---

## 📁 Project Structure  

After setup, your project will have:

```
cypress/
├── snapshots/
│   ├── baseline/           # Reference images
│   ├── actual/            # Current test run images  
│   ├── diff/              # Visual diff images
│   └── reports/           # Excel bug reports
└── support/
    └── e2e.js             # Import commands here
```

---

## 🌐 AI Provider Setup

### Google Gemini Setup
1. Get API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Set environment variables (see above)
3. Free tier: 15 requests/minute, 1M requests/day

### OpenAI Setup  
1. Get API key from [OpenAI Platform](https://platform.openai.com/api-keys)
2. Set environment variables (see above)  
3. Pay-per-use: ~$0.01-0.03 per analysis

### Anthropic Setup
1. Get API key from [Anthropic Console](https://console.anthropic.com/)
2. Set environment variables (see above)
3. Pay-per-use: ~$0.01-0.04 per analysis

---

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

---

---

## 📄 License

[ISC License](LICENSE) © 2026 Himanshu Singh

---

## 🆘 Troubleshooting

### Common Issues

**Q: Screenshots are blank or cropped**  
A: Ensure your `cypress.config.js` returns the modified config: `return configSnapshot(on, config, options);`

**Q: AI analysis not running**  
A: Check that AI environment variables are set and `snapshotOcrMode` is "after" (default)

**Q: TypeScript errors**  
A: Make sure you've imported the commands: `import "cypress-snapshot-bug-reporter/commands";`

**Q: Rate limiting errors**  
A: Adjust `AI_REGION_DELAY_MS` environment variable (default: 2000ms for Google, 0ms for others)

### Getting Help

- 📖 [API Documentation](docs/api/README.md)  
- 💬 [GitHub Discussions](https://github.com/Docode072/cypress-snapshot-bug-reporter/discussions)
- 🐛 [Issue Tracker](https://github.com/Docode072/cypress-snapshot-bug-reporter/issues)

---

**Made with ❤️ for the Cypress community**
