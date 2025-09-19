# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is @aegu/react-pouchdb-hooks - a React hooks library for PouchDB integration. It provides React components with reactive access to PouchDB databases through a collection of custom hooks.

## Development Commands

### Build

```bash
npm run build        # Build both browser and Node.js versions
```

### Testing

```bash
npm test            # Run all tests once
npm run test:watch  # Run tests in watch mode
npm run test-ci     # Run tests in CI mode
```

### Code Quality

```bash
npm run lint        # Run ESLint on all TypeScript/JavaScript files
npm run format      # Format all files with Prettier
npm run textlint    # Check documentation for text issues
```

## Architecture

### Core Pattern: Context + Hooks

The library uses React Context to provide PouchDB database instances to components, with hooks for accessing and subscribing to data changes.

### Key Components

1. **Provider (`src/context.tsx`)**: Wraps the app to provide database access
   - Manages PouchDB instances
   - Handles subscription management with batching support
   - Supports single or multiple databases

2. **SubscriptionManager (`src/subscription.ts`)**: Central event handling
   - Batches change events for performance
   - Manages document and view subscriptions
   - Configurable batching delay and leading-edge triggers

3. **State Machine (`src/state-machine.ts`)**: Consistent loading states
   - Handles loading/success/error states uniformly
   - Provides TypeScript-safe state transitions

### Main Hooks

- **usePouch**: Direct database access
- **useDoc**: Single document with real-time updates
- **useAllDocs**: Multiple documents with filtering
- **useFind**: Query with Mango selectors (requires pouchdb-find)
- **useView**: MapReduce views (requires pouchdb-mapreduce)

### Populate Feature

The library includes a powerful populate system (`src/usePopulate.ts`) for resolving document references:

- Bulk fetches referenced documents efficiently
- Supports nested population with depth control
- Prevents circular references
- Integrates with all data hooks via `populate` option

## TypeScript Configuration

- **Target**: ES2017 with ES2015 modules
- **Strict mode** enabled with all checks
- **Two build outputs**:
  - Browser: `lib/` (ES modules)
  - Node.js: `lib/node/` (CommonJS)

## Testing Approach

- **Framework**: Jest with React Testing Library
- **Environment**: jsdom for browser simulation
- **Test files**: `*.test.ts`, `*.test.tsx`
- **Performance tests**: `*.performance.test.ts`
- **Integration tests**: `*.integration.test.ts`

## Key Design Decisions

1. **Subscription Batching**: Changes are batched by default (100ms delay) to prevent excessive re-renders
2. **Type Safety**: Full TypeScript support with generic document types
3. **Memory Management**: Automatic cleanup of subscriptions on unmount
4. **Error Boundaries**: Hooks include error states for resilient UIs
5. **Initial Values**: Support for optimistic UI with initial document values

## Dependencies

- **PouchDB**: Core database (peer dependency)
- **React**: >=16.8 (for hooks support)
- **fast-deep-equal**: Efficient equality checks for memoization

## Publishing

- Package: `@aegu/react-pouchdb-hooks`
- Branch: `latest` (for releases)
- Semantic release configured for automated versioning
