---
id: populate
title: Working with References (Populate)
---

## Overview

In many applications, documents reference other documents by their ID. For example, a blog post might reference an author by `authorId`, or an order might reference a customer by `customerId`. The populate feature allows you to automatically fetch and include these referenced documents in your query results.

This is similar to SQL JOINs or MongoDB's populate functionality, but optimized for PouchDB's document-based structure.

## Basic Populate Example

Let's say you have documents that reference other documents, both at the top level and nested within objects:

```javascript
// Order document with both flat and nested references
{
  _id: 'order_123',
  title: 'Garden Supply Order',
  siteId: 'site_456',  // Flat reference
  material_info: {
    cultivar_id: 'cultivar_789',  // Nested reference
    quantity: 100
  }
}

// Site document
{
  _id: 'site_456',
  name: 'Main Greenhouse'
}

// Cultivar document
{
  _id: 'cultivar_789',
  name: 'Pink Mandevilla',
  color: 'pink'
}
```

Without populate, you'd need to fetch the order, then separately fetch the site and cultivar. With populate, you can do it all in one hook call using dot notation for nested references:

```jsx
import React from 'react'
import { useDoc } from '@aegu/react-pouchdb-hooks'

export function OrderDetails({ orderId }) {
  const {
    doc: order,
    loading,
    error,
  } = useDoc(orderId, {
    populate: {
      // Flat reference - just use the field name
      siteId: {
        as: 'site',
      },
      // Nested reference - use dot notation to access the field
      'material_info.cultivar_id': {
        as: 'material_info.cultivar', // Keeps populated data near its reference
      },
    },
  })

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return (
    <article>
      <h1>{order.title}</h1>
      <p>Site: {order.site?.name}</p>
      <div>
        <h3>Material Info</h3>
        <p>Cultivar: {order.material_info?.cultivar?.name}</p>
        <p>Color: {order.material_info?.cultivar?.color}</p>
        <p>Quantity: {order.material_info?.quantity}</p>
      </div>
    </article>
  )
}
```

## Populate Configuration

The populate configuration is an object where:

- **Key**: The field path to the reference ID. Use dot notation for nested fields (e.g., `'authorId'` or `'material_info.cultivar_id'`)
- **Value**: Configuration object with these properties:
  - `as`: Where to place the populated document. Use dot notation for nested placement (e.g., `'author'` or `'material_info.cultivar'`)
  - `db`: (Optional) Database name if the referenced document is in a different database
  - `populate`: (Optional) Nested populate configuration for the referenced document

```typescript
interface PopulateFieldConfig {
  as: string // Where to place the populated document (supports dot notation)
  db?: string // Database name if different from current
  populate?: PopulateConfig // Nested populate configuration
}
```

Dot notation makes it natural to work with nested document structures, keeping populated data organized near its references.

## Nested Population

You can populate references within populated documents. For example, if authors have company references:

```jsx
import React from 'react'
import { useDoc } from '@aegu/react-pouchdb-hooks'

export function BlogPostWithCompany({ postId }) {
  const {
    doc: post,
    loading,
    error,
  } = useDoc(postId, {
    populate: {
      authorId: {
        as: 'author',
        // Nested populate: also populate the author's company
        populate: {
          companyId: {
            as: 'company',
          },
        },
      },
      categoryId: {
        as: 'category',
      },
    },
    maxDepth: 2, // Limit recursion depth
  })

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return (
    <article>
      <h1>{post.title}</h1>
      <p>
        By: {post.author?.name} at {post.author?.company?.name}
      </p>
      <p>Category: {post.category?.name}</p>
      <div>{post.content}</div>
    </article>
  )
}
```

## Cross-Database Population

If your referenced documents are in different databases, specify the `db` option:

```jsx
import React from 'react'
import { useFind } from '@aegu/react-pouchdb-hooks'

export function Orders() {
  const {
    docs: orders,
    loading,
    error,
  } = useFind({
    selector: { type: 'order' },
    populate: {
      customerId: {
        as: 'customer',
        db: 'users', // Populate customer from users database
      },
      productIds: {
        as: 'products',
        db: 'catalog', // Populate products from catalog database
      },
    },
  })

  if (loading) return <div>Loading orders...</div>
  if (error) return <div>Error: {error.message}</div>

  return (
    <div>
      <h1>Orders</h1>
      {orders.map(order => (
        <div key={order._id}>
          <h3>Order #{order.orderNumber}</h3>
          <p>Customer: {order.customer?.name}</p>
          <p>Products: {order.products?.map(p => p.name).join(', ')}</p>
        </div>
      ))}
    </div>
  )
}
```

## Array References

Populate also works with arrays of IDs:

```javascript
// Document with array of references
{
  _id: 'order_123',
  orderNumber: 'ORD-001',
  productIds: ['prod_1', 'prod_2', 'prod_3'], // Array of product IDs
  customerId: 'user_456'
}
```

```jsx
import React from 'react'
import { useDoc } from '@aegu/react-pouchdb-hooks'

export function OrderDetails({ orderId }) {
  const {
    doc: order,
    loading,
    error,
  } = useDoc(orderId, {
    populate: {
      customerId: {
        as: 'customer',
      },
      productIds: {
        as: 'products', // Will populate all products in the array
      },
    },
  })

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return (
    <div>
      <h2>Order #{order.orderNumber}</h2>
      <p>Customer: {order.customer?.name}</p>

      <h3>Products:</h3>
      {order.products?.map(product => (
        <div key={product._id}>
          <p>
            {product.name} - ${product.price}
          </p>
        </div>
      ))}
    </div>
  )
}
```

## Performance Considerations

The populate feature is optimized for performance:

- **Bulk Fetching**: Uses `allDocs()` to fetch multiple documents in a single request
- **Caching**: Documents are cached during a single populate operation to avoid duplicate fetches
- **Circular Reference Detection**: Prevents infinite loops when documents reference each other
- **Depth Limiting**: `maxDepth` option prevents excessive recursion

## Best Practices

1. **Use Meaningful Field Names**: Choose descriptive names for the `as` field:

   ```jsx
   populate: {
     authorId: { as: 'author' }, // Good
     authorId: { as: 'a' }       // Bad
   }
   ```

2. **Limit Recursion Depth**: Set appropriate `maxDepth` for nested populates:

   ```jsx
   const { doc } = useDoc(id, {
     populate: {
       /* ... */
     },
     maxDepth: 2, // Reasonable depth
   })
   ```

3. **Handle Missing References**: Always use optional chaining:

   ```jsx
   <p>Author: {post.author?.name || 'Unknown'}</p>
   ```

4. **Consider Database Structure**: Group related documents in the same database when possible to avoid cross-database populates.

## Using with Different Hooks

Populate works with all query hooks:

```jsx
// With useFind
const { docs } = useFind({
  selector: { type: 'post' },
  populate: { authorId: { as: 'author' } },
})

// With useAllDocs
const { rows } = useAllDocs({
  include_docs: true,
  populate: { authorId: { as: 'author' } },
})

// With useView
const { rows } = useView('posts/by_date', {
  include_docs: true,
  populate: { authorId: { as: 'author' } },
})

// Standalone with usePopulate
const { docs } = usePopulate(documents, {
  populate: { authorId: { as: 'author' } },
})
```

## Common Patterns

### User Profiles with Nested Data

```jsx
export function UserProfile({ userId }) {
  const { doc: user } = useDoc(userId, {
    populate: {
      companyId: {
        as: 'company',
        populate: {
          industryId: { as: 'industry' },
        },
      },
      managerId: { as: 'manager' },
      departmentId: { as: 'department' },
    },
  })

  return (
    <div>
      <h1>{user.name}</h1>
      <p>Company: {user.company?.name}</p>
      <p>Industry: {user.company?.industry?.name}</p>
      <p>Manager: {user.manager?.name}</p>
      <p>Department: {user.department?.name}</p>
    </div>
  )
}
```

### E-commerce Product Listings

```jsx
export function ProductList() {
  const { docs: products } = useFind({
    selector: { type: 'product', active: true },
    populate: {
      categoryId: { as: 'category' },
      brandId: { as: 'brand' },
      supplierId: { as: 'supplier' },
    },
  })

  return (
    <div>
      {products.map(product => (
        <div key={product._id}>
          <h3>{product.name}</h3>
          <p>Brand: {product.brand?.name}</p>
          <p>Category: {product.category?.name}</p>
          <p>Supplier: {product.supplier?.name}</p>
          <p>${product.price}</p>
        </div>
      ))}
    </div>
  )
}
```

The populate feature makes working with relational data in PouchDB much more convenient and performant!
