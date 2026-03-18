# PRD: npm Library

## Overview
A well-structured npm package with TypeScript support, comprehensive documentation, tree-shakeable exports, and automated publishing. Designed as a reusable utility library.

## Target Users
- JavaScript and TypeScript developers looking for reusable utilities
- Teams standardizing shared logic across multiple projects
- Open source contributors publishing packages to npm

## Core Features
1. **TypeScript First** - Written in TypeScript with generated .d.ts declaration files
2. **Dual Format** - Publish both ESM and CommonJS builds for maximum compatibility
3. **Tree Shaking** - Named exports with proper sideEffects configuration for optimal bundling
4. **Comprehensive Docs** - Auto-generated API documentation from TSDoc comments
5. **Semantic Versioning** - Automated changelog generation and version bumping
6. **Zero Dependencies** - No runtime dependencies for minimal install footprint
7. **Playground** - Interactive examples in a docs site for trying the library

## Technical Requirements
- TypeScript 5+ with strict mode
- tsup for dual ESM/CJS builds
- Vitest for testing
- typedoc for API documentation generation
- changesets for version management
- GitHub Actions for CI/CD and npm publishing
- package.json exports map for subpath exports

## Quality Gates
- Unit tests with 90%+ code coverage
- Type tests verifying public API type signatures
- Bundle size tracked and budgeted (fail CI if over limit)
- ESM and CJS builds both importable in Node.js
- TypeScript declarations compile cleanly in consuming projects
- Documentation generated without warnings

## Success Metrics
- Package installs and imports correctly in ESM and CJS projects
- All public functions have TSDoc comments and generated docs
- Test coverage exceeds 90% across all modules
- Bundle size stays under defined budget
- Changelog accurately reflects changes between versions
- All tests pass
