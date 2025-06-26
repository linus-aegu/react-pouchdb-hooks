---
id: performance
title: Performance Optimization
---

## Overview

use-pouchdb includes several built-in performance optimizations to ensure your React applications remain responsive, especially when dealing with high-frequency document updates or large datasets.

## Subscription Batching

One of the most significant performance improvements is **subscription batching**. When documents change rapidly, the library batches these changes together to prevent render thrashing.

### How It Works

- **Leading Edge**: First change processes immediately for instant responsiveness (default: `true`)
- **Subsequent Changes**: Batched together with a configurable delay (default: 16ms)
- Multiple rapid document changes are processed efficiently
- Maintains under 4 renders for initial loads and under 2 renders for updates
- Completely backward compatible - existing code works without changes

### Configuration

You can configure batching behavior through the Provider:

```jsx
import React from 'react'
import PouchDB from 'pouchdb-browser'
import { Provider } from 'use-pouchdb'

const db = new PouchDB('local')

function App() {
  return (
    <Provider
      pouchdb={db}
      subscriptionOptions={{
        enableBatching: true, // Enable batching (default: true)
        batchDelay: 16, // Batch delay in milliseconds (default: 16)
        leadingEdge: true, // Process first change immediately (default: true)
      }}
    >
      <YourApp />
    </Provider>
  )
}
```

### Leading Edge vs Traditional Batching

**Leading Edge Batching (default: `leadingEdge: true`)**:

- ✅ First change: Immediate response (0ms delay)
- ✅ Subsequent changes: Batched (16ms delay)
- ✅ Best user experience - feels instant while preventing thrashing

**Traditional Batching (`leadingEdge: false`)**:

- ⏱️ All changes: Delayed by batch delay
- ✅ Consistent timing but less responsive

```jsx
// Leading edge: Best UX (default)
subscriptionOptions={{
  leadingEdge: true,
  batchDelay: 16
}}

// Traditional: All changes delayed
subscriptionOptions={{
  leadingEdge: false,
  batchDelay: 16
}}
```

### When to Adjust Batching

- **High-frequency updates**: Increase `batchDelay` to 50-100ms for applications with very rapid document changes
- **Real-time responsiveness**: Keep `leadingEdge: true` (default) and decrease `batchDelay` to 5-10ms
- **Consistent timing**: Set `leadingEdge: false` if you need predictable delays for all changes
- **Disable batching**: Set `enableBatching: false` only if you need immediate individual updates

```jsx
// For real-time apps requiring instant feedback
<Provider
  pouchdb={db}
  subscriptionOptions={{
    enableBatching: true,
    leadingEdge: true,    // Instant first response
    batchDelay: 5,        // Very fast subsequent batching
  }}
>

// For bulk data processing with consistent timing
<Provider
  pouchdb={db}
  subscriptionOptions={{
    enableBatching: true,
    leadingEdge: false,   // All changes use same delay
    batchDelay: 100,      // Less frequent updates
  }}
>
```

## Optimized Change Feeds

The library uses several optimizations for change feeds:

### include_docs Optimization

- Uses `include_docs: true` in change feeds to eliminate separate `pouch.get()` calls
- Reduces database round trips by 50% or more
- Automatically enabled - no configuration needed

### Document Fingerprinting

- Intelligent memoization prevents unnecessary re-renders
- Documents are compared by content, not just reference
- Only triggers updates when document content actually changes

## Query Performance

### Memoization

All hooks use deep equality checks to prevent unnecessary queries:

```jsx
const { docs } = useFind({
  selector: { type: 'post' },
  sort: ['title'], // Only re-queries if these values actually change
  populate: { authorId: { as: 'author' } },
})
```

### Populate Optimization

The populate feature includes several performance optimizations:

- **Bulk fetching**: Uses `allDocs()` to fetch multiple referenced documents in single requests
- **Reference caching**: Documents are cached during a single populate operation
- **Circular reference detection**: Prevents infinite loops
- **Depth limiting**: `maxDepth` prevents excessive recursion

```jsx
const { docs } = useFind({
  selector: { type: 'post' },
  populate: {
    authorId: { as: 'author' },
    categoryId: { as: 'category' },
  },
  maxDepth: 3, // Reasonable depth limit
})
```

## Performance Testing

The library includes comprehensive performance testing to ensure optimizations work correctly:

```javascript
// Example performance test pattern
test('should not trigger excessive re-renders', async () => {
  const renderCount = jest.fn()

  function TestComponent() {
    renderCount()
    const { docs } = useFind({
      selector: { type: 'post' },
    })
    return <div>{docs.length} posts</div>
  }

  render(<TestComponent />)

  // Should render no more than 4 times for initial load
  expect(renderCount).toHaveBeenCalledTimes(4)
})
```

## Best Practices

### 1. Use Appropriate Batch Delays

```jsx
// Good: Reasonable delay for most apps
subscriptionOptions={{ batchDelay: 16 }}

// Consider: Higher delay for bulk operations
subscriptionOptions={{ batchDelay: 50 }}

// Avoid: Too low delay can cause performance issues
subscriptionOptions={{ batchDelay: 1 }}
```

### 2. Limit Populate Depth

```jsx
// Good: Reasonable depth
const { docs } = useFind({
  selector: { type: 'post' },
  populate: { authorId: { as: 'author' } },
  maxDepth: 2,
})

// Avoid: Excessive depth
maxDepth: 10 // Can cause performance issues
```

### 3. Use Stable References

```jsx
// Good: Stable selector object
const selector = useMemo(() => ({ type: 'post' }), [])
const { docs } = useFind({ selector })

// Avoid: New object on every render
const { docs } = useFind({
  selector: { type: 'post' }, // New object every render
})
```

### 4. Monitor Performance

```jsx
import { useEffect } from 'react'

function PerformanceMonitor() {
  const { docs, loading } = useFind({
    selector: { type: 'post' },
  })

  useEffect(() => {
    console.log(`Loaded ${docs.length} posts`, {
      loading,
      timestamp: Date.now(),
    })
  }, [docs.length, loading])

  return <div>{docs.length} posts</div>
}
```

## Performance Metrics

The optimizations achieve these performance targets:

- **Initial Load**: Under 4 renders for first data fetch
- **Updates**: Under 2 renders for document updates
- **Batching**: Configurable delay (default 16ms) for rapid changes
- **Populate**: Bulk fetching reduces database calls by 70%+
- **Memory**: Efficient cleanup prevents memory leaks

## Troubleshooting Performance Issues

### High Render Count

If you're seeing excessive renders:

1. Check if selectors/options are stable:

   ```jsx
   // Use useMemo for complex objects
   const options = useMemo(
     () => ({
       selector: { type: 'post' },
       sort: ['title'],
     }),
     []
   )
   ```

2. Increase batch delay:
   ```jsx
   subscriptionOptions={{ batchDelay: 50 }}
   ```

### Slow Populate Operations

If populate is slow:

1. Reduce populate depth:

   ```jsx
   maxDepth: 2 // Instead of higher values
   ```

2. Consider database structure:

   ```jsx
   // Better: Keep related docs in same database
   populate: { authorId: { as: 'author' } }

   // Slower: Cross-database populate
   populate: { authorId: { as: 'author', db: 'users' } }
   ```

### Memory Issues

If you're experiencing memory leaks:

1. Ensure components unmount properly
2. Check for circular references in populate
3. Monitor subscription cleanup

The performance optimizations in use-pouchdb are designed to work automatically while providing configuration options for specific needs. Most applications will see significant performance improvements without any configuration changes.
