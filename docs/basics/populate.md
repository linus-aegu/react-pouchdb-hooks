---
id: populate
title: Working with References (Populate)
---

## Overview

In many applications, documents reference other documents by their ID. For example, a blog post might reference an author by `authorId`, or an order might reference a customer by `customerId`. The populate feature allows you to automatically fetch and include these referenced documents in your query results.

This is similar to SQL JOINs or MongoDB's populate functionality, but optimized for PouchDB's document-based structure.

## Basic Populate Example

Let's say you have blog posts that reference authors:

```javascript
// Blog post document
{
  _id: 'post_123',
  title: 'Getting Started with PouchDB',
  content: 'PouchDB is a great database...',
  authorId: 'user_456', // Reference to author
  categoryId: 'cat_789' // Reference to category
}

// Author document
{
  _id: 'user_456',
  name: 'John Doe',
  email: 'john@example.com'
}

// Category document
{
  _id: 'cat_789',
  name: 'Technology'
}
```

Without populate, you'd need to fetch the post, then separately fetch the author and category. With populate, you can do it all in one hook call:

```jsx
import React from 'react'
import { useDoc } from '@aegu/react-pouchdb-hooks'

export function BlogPost({ postId }) {
  const {
    doc: post,
    loading,
    error,
  } = useDoc(postId, {
    populate: {
      authorId: {
        as: 'author', // The populated author will be available as post.author
      },
      categoryId: {
        as: 'category', // The populated category will be available as post.category
      },
    },
  })

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return (
    <article>
      <h1>{post.title}</h1>
      <p>By: {post.author?.name}</p>
      <p>Category: {post.category?.name}</p>
      <div>{post.content}</div>
    </article>
  )
}
```

## Populate Configuration

The populate configuration is an object where:

- **Key**: The field name in your document that contains the reference ID
- **Value**: Configuration object with these properties:
  - `as`: The field name where the populated document will be stored
  - `db`: (Optional) Database name if the referenced document is in a different database
  - `populate`: (Optional) Nested populate configuration for the referenced document

```typescript
interface PopulateFieldConfig {
  as: string // Field name where populated document will be stored
  db?: string // Database name if different from current
  populate?: PopulateConfig // Nested populate configuration
}
```

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
