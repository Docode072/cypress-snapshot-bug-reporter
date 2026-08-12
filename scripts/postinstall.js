#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

try {
  const projectRoot = process.env.INIT_CWD || process.cwd();
  const envPath = path.join(projectRoot, '.env');
  const envSamplePath = path.join(projectRoot, '.env.sample');
  
  const templateContent = `# ============================================================
# Cypress Snapshot Bug Reporter — AI Configuration
# ============================================================
# Uncomment ONE provider section below and add your API key(s).
# Get free API keys:
#   Google Gemini : https://makersuite.google.com/app/apikey
#   OpenAI       : https://platform.openai.com/api-keys
#   Anthropic    : https://console.anthropic.com/
# ============================================================

# ── Google Gemini (Recommended — Free Tier Available) ────────
AI_PROVIDER=google
AI_MODEL=gemini-1.5-flash
AI_ENDPOINT=https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent
AI_API_KEY=PASTE_YOUR_KEY_HERE

# ── OpenAI ───────────────────────────────────────────────────
# AI_PROVIDER=openai
# AI_MODEL=gpt-4o
# AI_ENDPOINT=https://api.openai.com/v1/chat/completions
# AI_API_KEY=PASTE_YOUR_KEY_HERE

# ── Anthropic Claude ─────────────────────────────────────────
# AI_PROVIDER=anthropic
# AI_MODEL=claude-3-5-sonnet-20241022
# AI_ENDPOINT=https://api.anthropic.com/v1/messages
# AI_API_KEY=PASTE_YOUR_KEY_HERE

# ── Multiple API Keys (Optional) ────────────────────────────
# Add up to 4 keys separated by commas for automatic rotation.
# If one key hits rate limit or quota, the plugin shifts to next.
#
# Example:
# AI_API_KEY=key1,key2,key3,key4

# ── Optional Settings ───────────────────────────────────────
# AI_TIMEOUT_MS=60000
# AI_REGION_DELAY_MS=2000
`;

  let envCreated = false;

  if (fs.existsSync(envPath)) {
    console.log('✅ Found existing .env file. Skipping creation.');
  } else {
    fs.writeFileSync(envPath, templateContent, 'utf8');
    fs.writeFileSync(envSamplePath, templateContent, 'utf8');
    envCreated = true;
  }

  console.log(`
✅ Cypress Snapshot Bug Reporter installed!
${envCreated ? `
📝 Created .env file with sample AI configuration
   → Open .env and replace PASTE_YOUR_KEY_HERE with your API key
   → Get a free key: https://makersuite.google.com/app/apikey
` : ''}
🔍 Verify setup:  npx cypress-snapshot-verify
📖 Documentation: https://github.com/Docode072/cypress-snapshot-bug-reporter
`);

} catch (error) {
  // Wrap in try/catch so postinstall never crashes the npm install
  console.error('⚠️ postinstall script failed (non-fatal):', error.message);
}
