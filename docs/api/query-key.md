# Query Key Pattern

The query key pattern in `@aegu/react-pouchdb-hooks` provides stable query identification and optimized performance, similar to TanStack Query (React Query) and SWR.

## Overview

Query keys solve several performance and caching issues:

- **Stable identity**: Queries are identified by their key, not object references
- **Explicit control**: Developers can control when queries are considered "different"
- **Better performance**: Single stable dependency instead of multiple deep comparisons
- **Future-proof**: Sets foundation for advanced caching features

## Basic Usage

### Auto-generated Query Keys (Default)

By default, query keys are auto-generated from your query options:

```typescript
const { docs } = useFind({
  selector: { type: 'BoxType' },
  sort: ['name'],
  limit: 50,
})
// Auto-generated queryKey based on selector, sort, and limit
```

### Explicit Query Keys

You can provide your own stable query key:

```typescript
// String key
const { docs } = useFind({
  selector: { type: 'BoxType' },
  queryKey: 'all-box-types',
})

// Array key (TanStack Query style)
const { docs } = useFind({
  selector: { type: 'BoxType', status: 'active' },
  queryKey: ['boxTypes', { status: 'active' }, version],
})
```

## Supported Hooks

All query hooks support the query key pattern:

### useFind

```typescript
const { docs } = useFind({
  selector: { type: 'Product' },
  queryKey: ['products', filters, page],
  populate: {
    category_id: { as: 'category' },
  },
})
```

### useAllDocs

```typescript
const { rows } = useAllDocs({
  include_docs: true,
  startkey: 'product_',
  endkey: 'product_\\uffff',
  queryKey: ['allDocs', 'products'],
})
```

### useView

```typescript
const { rows } = useView('myIndex/byCategory', {
  key: 'electronics',
  include_docs: true,
  queryKey: ['view', 'byCategory', 'electronics'],
})
```

## QueryKey Options

All hooks accept these additional options:

```typescript
interface QueryKeyOptions {
  /**
   * Optional stable query key for caching and comparison.
   * If provided, this will be used instead of auto-generating from options.
   */
  queryKey?: string | readonly unknown[]
}
```

## Performance Benefits

### Before (Multiple Dependencies)

```typescript
// ❌ Old approach: multiple expensive deep comparisons
useEffect(() => {
  // Query logic
}, [
  pouch,
  subscriptionManager,
  dispatch,
  index,
  selector,
  fields,
  sort,
  limit,
  skip, // 6+ individual deps!
  populateOptions,
  maxDepth,
])
```

### After (Single Stable Dependency)

```typescript
// ✅ New approach: single optimized comparison
useEffect(() => {
  // Query logic
}, [
  pouch,
  subscriptionManager,
  dispatch,
  queryKey, // Single stable dependency
  populateOptions,
  maxDepth,
])
```

### Performance Improvements

- **Fewer re-renders**: Single stable dependency reduces unnecessary effect executions
- **Faster comparisons**: Multi-tier optimization (reference → shallow → deep → serialize)
- **Memory efficient**: WeakMap caching prevents memory leaks
- **Object key ordering**: Deterministic serialization prevents cache misses

## Real-World Examples

### TanStack Query Style

```typescript
const ProductsList = ({ categoryId, page, filters }) => {
  const { docs: products, loading } = useFind({
    selector: {
      type: 'Product',
      categoryId,
      ...filters,
    },
    sort: ['name'],
    limit: 20,
    skip: page * 20,
    queryKey: ['products', categoryId, page, filters],
    populate: {
      category_id: { as: 'category' },
      supplier_id: { as: 'supplier' },
    },
  })

  if (loading) return <div>Loading...</div>

  return (
    <div>
      {products.map(product => (
        <ProductCard key={product._id} product={product} />
      ))}
    </div>
  )
}
```

### Dynamic Query Keys

```typescript
const useUserPosts = (userId: string, filters: PostFilters) => {
  return useFind({
    selector: {
      type: 'Post',
      authorId: userId,
      ...filters,
    },
    sort: [{ createdAt: 'desc' }],
    queryKey: ['posts', 'byUser', userId, filters],
    populate: {
      authorId: { as: 'author' },
    },
  })
}
```

### Conditional Queries

```typescript
const useUserProfile = (userId?: string) => {
  return useFind({
    selector: { _id: userId },
    queryKey: userId ? ['user', userId] : null, // Null disables query
    populate: {
      departmentId: { as: 'department' },
    },
  })
}
```

## Migration Guide

### Existing Code (No Changes Required)

Your existing code continues to work without modifications:

```typescript
// ✅ This continues to work exactly as before
const { docs } = useFind({
  selector: { type: 'Product' },
  sort: ['name'],
  limit: 50,
})
```

### Opt-in Optimization

Add queryKey when you need explicit cache control:

```typescript
// ✅ Add queryKey for better performance and explicit cache control
const { docs } = useFind({
  selector: { type: 'Product' },
  sort: ['name'],
  limit: 50,
  queryKey: ['products', 'sorted-by-name'], // New optimization
})
```

### Complex Object Optimization

For queries with complex objects that recreate on each render:

```typescript
// ❌ Before: Object recreated on every render
const filter = useMemo(
  () => ({
    status: { $in: ['active', 'pending'] },
    category: selectedCategory,
  }),
  [selectedCategory],
)

const { docs } = useFind({
  selector: { type: 'Product', ...filter },
})

// ✅ After: Stable queryKey prevents unnecessary re-queries
const { docs } = useFind({
  selector: {
    type: 'Product',
    status: { $in: ['active', 'pending'] },
    category: selectedCategory,
  },
  queryKey: ['products', 'active-pending', selectedCategory],
})
```

## Best Practices

### 1. Use Hierarchical Keys

```typescript
// ✅ Good: Clear hierarchy
;['users', userId, 'posts', { status: 'published' }][
  // ❌ Avoid: Flat structure
  ('user-posts-published', userId)
]
```

### 2. Include All Variables

```typescript
// ✅ Good: All variables that affect the query
;['products', categoryId, sortBy, filters, page][
  // ❌ Bad: Missing variables
  ('products', categoryId)
] // Missing sortBy, filters, page
```

### 3. Use Stable References

```typescript
// ✅ Good: Stable object reference
const filters = useMemo(
  () => ({
    status: 'active',
    category: selectedCategory,
  }),
  [selectedCategory],
)

const { docs } = useFind({
  selector: { type: 'Product', ...filters },
  queryKey: ['products', filters],
})

// ✅ Also good: Explicit key
const { docs } = useFind({
  selector: { type: 'Product', status: 'active', category: selectedCategory },
  queryKey: ['products', 'active', selectedCategory],
})
```

### 4. Version Your Keys

```typescript
// ✅ Good: Include version for breaking schema changes
;['products', 'v2', categoryId, filters]
```

## TypeScript Support

Full TypeScript support with proper inference:

```typescript
interface Product {
  _id: string
  name: string
  categoryId: string
  price: number
}

const { docs } = useFind<Product>({
  selector: { type: 'Product' },
  queryKey: ['products', 'all'], // Type-safe
})
// docs is properly typed as Product[]
```

## Future Features

The queryKey pattern enables future features:

- **Cross-component deduplication**: Multiple components using the same queryKey share results
- **Background refetching**: Automatic updates with configurable intervals
- **Optimistic updates**: Immediate UI updates with server sync
- **Devtools integration**: Debug query states and cache contents
- **Persistent caching**: Cache queries across app restarts

## Troubleshooting

### Query Not Re-running

If your query isn't re-running when expected, check your queryKey:

```typescript
// ❌ Problem: queryKey doesn't include all variables
const { docs } = useFind({
  selector: { type: 'Product', category: selectedCategory },
  queryKey: 'products', // Missing selectedCategory!
})

// ✅ Solution: Include all variables in queryKey
const { docs } = useFind({
  selector: { type: 'Product', category: selectedCategory },
  queryKey: ['products', selectedCategory],
})
```

### Excessive Re-renders

If you're seeing too many re-renders, check for unstable queryKey:

```typescript
// ❌ Problem: New array created every render
const { docs } = useFind({
  selector: { type: 'Product' },
  queryKey: ['products', { complex: 'object' }], // New object every time!
})

// ✅ Solution: Stable reference
const stableFilter = useMemo(() => ({ complex: 'object' }), [])
const { docs } = useFind({
  selector: { type: 'Product' },
  queryKey: ['products', stableFilter],
})
```
