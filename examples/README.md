# Examples

This directory contains complete example projects demonstrating how to use `cypress-snapshot-bug-reporter` in different scenarios.

## Available Examples

### 1. Basic Usage (`basic-usage/`)
Simple setup with OpenAI for visual regression testing of a dashboard application.

**Features:**
- Basic snapshot comparison
- OpenAI GPT-4o integration  
- Automatic report generation

### 2. Advanced Configuration (`advanced-config/`)
Complete configuration showcasing all plugin features.

**Features:**
- Custom AI providers (Google Gemini)
- Advanced viewport handling
- Custom thresholds and reporting
- TypeScript implementation

### 3. CI/CD Integration (`ci-cd-integration/`)
Example GitHub Actions workflow for automated visual testing.

**Features:**
- GitHub Actions CI/CD
- Multi-browser testing
- Artifact uploading
- Slack notifications

## Running Examples

Each example contains its own README with setup instructions:

```bash
cd examples/basic-usage
npm install
npm run cypress:run
```

## Creating Your Own Example

1. Copy the `basic-usage/` template
2. Modify the configuration for your needs
3. Update environment variables
4. Run tests with `npm run cypress:run`