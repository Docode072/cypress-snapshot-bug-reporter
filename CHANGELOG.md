# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0-beta.1] - 2026-08-11

### 🎉 Major Release - Complete Modernization

This is a complete rewrite and modernization of the plugin to meet 2024-2026 industry standards.

### ✨ Added
- **Full TypeScript Support**: Complete type definitions and TypeScript source code
- **Modern Build Pipeline**: TypeScript compilation with source maps and declaration files  
- **Comprehensive Testing**: Jest framework with unit, integration, and e2e test structure
- **Code Quality Tools**: ESLint, Prettier, and EditorConfig for consistent code style
- **Modular Architecture**: Clean separation of concerns with focused modules
- **Enhanced AI Providers**: Improved support for OpenAI, Anthropic, and Google Gemini
- **Modern Package Structure**: Proper exports map, conditional exports, and type support
- **CI/CD Pipeline**: GitHub Actions workflow for automated testing and publishing
- **Comprehensive Documentation**: API reference, usage guides, and examples

### 🔧 Changed
- **BREAKING**: Minimum Node.js version increased to ≥18.0.0 (was ≥16.0.0)
- **BREAKING**: Package structure reorganized with `dist/` output and `src/` source
- **Enhanced**: Better error messages and type safety throughout
- **Improved**: More reliable AI configuration and provider handling
- **Modernized**: Updated to use latest TypeScript and tooling best practices

### 🔄 Migrated  
- Converted all JavaScript source files to TypeScript
- Split 628-line monolithic `aiAnalysisTasks.js` into 12 focused modules
- Reorganized plugin and commands with proper separation of concerns
- Migrated tests from ad-hoc Node.js assertions to Jest with TypeScript support

### 📦 Infrastructure
- Added TypeScript 6.0.3 with strict configuration
- Configured ESLint with TypeScript rules and Prettier formatting
- Set up Jest test framework with coverage reporting
- Created comprehensive type definitions for all public APIs
- Established modern build pipeline with source maps

### 🛡️ Backward Compatibility
- **Maintained**: All existing `cy.matchImageSnapshot()` usage continues to work unchanged
- **Preserved**: Same environment variable configuration
- **Kept**: Identical task names and plugin registration API
- **Ensured**: No breaking changes to end-user test code

### 📚 Documentation
- **New**: Comprehensive README with TypeScript examples
- **Added**: Full API documentation with type signatures  
- **Created**: Usage guides for all AI providers
- **Included**: Migration guide from v1.x to v2.x
- **Provided**: Troubleshooting section with common issues

---

## [1.6.1] - 2024-08-10

### Legacy Version (JavaScript)
Final version of the original JavaScript implementation.

### Features
- Visual regression testing with pixelmatch
- AI-powered analysis with OpenAI, Anthropic, Google Gemini
- Excel report generation
- Cypress plugin and custom commands
- OCR capability with Tesseract.js
- Basic Node.js test runner

---

## Migration Guide: v1.x → v2.x

### What Changed
1. **Language**: JavaScript → TypeScript (full migration)
2. **Structure**: Flat files → Organized modules with build pipeline  
3. **Testing**: Ad-hoc → Jest with proper test structure
4. **Tooling**: Basic → Modern (ESLint, Prettier, TypeScript)
5. **Types**: No types → Comprehensive type definitions

### Migration Steps
1. **Update Node.js**: Ensure you're running Node.js ≥18.0.0
2. **Install v2.x**: `npm install cypress-snapshot-bug-reporter@^2.0.0`
3. **No Code Changes**: Your existing Cypress tests continue to work unchanged
4. **Optional TypeScript**: Add TypeScript support for better developer experience

### Benefits of Upgrading
- ✅ **Better Developer Experience**: Full TypeScript support with autocomplete
- ✅ **Modern Architecture**: Clean, maintainable code structure
- ✅ **Improved Reliability**: Better error handling and type safety
- ✅ **Future-Proof**: Built with 2024-2026 best practices