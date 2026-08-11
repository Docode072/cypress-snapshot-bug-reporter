# API Reference

## Plugin Configuration

### `configSnapshot(on, config, options?)`

Configure the Cypress snapshot plugin in your `cypress.config.js`.

```typescript
import { configSnapshot } from 'cypress-snapshot-bug-reporter/plugin';

export default defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      return configSnapshot(on, config, {
        snapshotOcrMode: 'after', // or 'deferred'
        baselineDir: 'cypress/snapshots/baseline',
        actualDir: 'cypress/snapshots/actual',
        diffDir: 'cypress/snapshots/diff',
        excelFile: 'cypress/snapshots/reports/diff-report.xlsx'
      });
    },
  },
});
```

**Parameters:**
- `on: Cypress.PluginEvents` - Cypress plugin events object
- `config: Cypress.PluginConfigOptions` - Cypress configuration object  
- `options?: SnapshotPluginOptions` - Optional plugin configuration

**Returns:** `Cypress.PluginConfigOptions` - Modified config object

### Configuration Options

```typescript
interface SnapshotPluginOptions {
  /** Analysis mode: "after" (default) or "deferred" */
  snapshotOcrMode?: 'after' | 'deferred';
  
  /** Directory for baseline images */
  baselineDir?: string;
  
  /** Directory for actual images */  
  actualDir?: string;
  
  /** Directory for diff images */
  diffDir?: string;
  
  /** Excel report output path */
  excelFile?: string;
  
  /** Viewport configuration */
  viewportWidth?: number;
  viewportHeight?: number;
  maxViewportWidth?: number;
  maxViewportHeight?: number;
  fitToPage?: boolean;
}
```

## Custom Commands

### `cy.matchImageSnapshot(name, options?)`

Compare a visual snapshot of the current element or page.

```typescript
// Page-level screenshot
cy.matchImageSnapshot('login-page');

// Element screenshot  
cy.get('[data-testid="header"]').matchImageSnapshot('header');

// With options
cy.matchImageSnapshot('dashboard', {
  threshold: 0.01,
  capture: 'fullPage',
  baseViewport: { width: 1920, height: 1080 }
});
```

**Parameters:**
- `name: string` - Unique snapshot name (without .png extension)
- `options?: SnapshotOptions` - Optional snapshot configuration

### Snapshot Options

```typescript
interface SnapshotOptions {
  /** Pixel mismatch threshold (0-1) */
  threshold?: number;
  
  /** Analysis mode override */
  ocrMode?: 'after' | 'deferred';
  
  /** Capture mode */
  capture?: 'viewport' | 'fullPage' | 'runner';
  
  /** Base viewport dimensions */
  baseViewport?: {
    width: number;
    height: number;
  };
  
  /** Padding around element */
  padding?: number;
  
  /** Delay before capture */
  delay?: number;
  
  /** Capture timeout */
  timeout?: number;
  
  /** Fail test on mismatch */
  failOnSnapshotDiff?: boolean;
  
  /** Overwrite baseline */
  overwrite?: boolean;
}
```

## AI Configuration

Set environment variables for AI-powered analysis:

### Google Gemini
```bash
export AI_PROVIDER=google
export AI_MODEL=gemini-1.5-flash
export AI_ENDPOINT=https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent
export AI_API_KEY=your_gemini_api_key
```

### OpenAI
```bash
export AI_PROVIDER=openai  
export AI_MODEL=gpt-4o
export AI_ENDPOINT=https://api.openai.com/v1/chat/completions
export AI_API_KEY=sk-...
```

### Anthropic Claude
```bash
export AI_PROVIDER=anthropic
export AI_MODEL=claude-3-5-sonnet-20241022
export AI_ENDPOINT=https://api.anthropic.com/v1/messages  
export AI_API_KEY=sk-ant-...
```

## CLI Commands

### Manual Analysis Report
```bash
npx cypress-snapshot-report
```

Generate Excel bug report from recorded diffs.

## TypeScript Support

The plugin provides full TypeScript support with type definitions:

```typescript
import type { 
  SnapshotOptions,
  ComparisonResult,
  AIAnalysisResult 
} from 'cypress-snapshot-bug-reporter';

// Augmented Cypress namespace
declare namespace Cypress {
  interface Chainable {
    matchImageSnapshot(name: string, options?: SnapshotOptions): Chainable<Element>;
  }
}
```