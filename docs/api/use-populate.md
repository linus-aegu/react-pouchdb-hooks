---
id: use-populate
title: usePopulate
---

## Overview

The `usePopulate` hook is a standalone utility for populating documents with referenced data. It takes documents and a populate configuration, then fetches and includes the referenced documents according to the configuration.

This hook is used internally by other hooks (`useDoc`, `useFind`, `useAllDocs`, `useView`) when their `populate` option is used, but can also be used directly for custom populate operations.

`usePopulate` can only be invoked from a component nested inside of a [`<Provider />`](./provider.md).

## Parameters

1. `documents: T | T[]` - Single document or array of documents to populate.
2. `options: PopulateOptions` - Populate configuration options.
   - `options.populate: PopulateConfig` - Configuration for populating referenced documents. **Required**.
   - `options.maxDepth?: number` - Maximum recursion depth for nested populate operations. Default is `3`.
   - `options.db?: string` - Selects the database to be used. The database is selected by it's name/key.
     The special key `"_default"` selects the _default database_. Defaults to `"_default"`.

## PopulateConfig

The `populate` option accepts a configuration object where:

- **Key**: The field name in your document that contains a reference ID
- **Value**: Configuration for how to populate that field

```typescript
interface PopulateFieldConfig {
  as: string // Field name where populated document will be stored
  db?: string // Database name if different from current (optional)
  populate?: PopulateConfig // Nested populate configuration (recursive)
}

interface PopulateConfig {
  [fieldName: string]: PopulateFieldConfig
}

interface PopulateOptions {
  populate: PopulateConfig
  maxDepth?: number
  db?: string
}
```

## Result

`usePopulate` results an object with those fields:

- `docs: T | T[]` - The populated document(s). The structure matches the input (single document or array).
  Documents will include the populated fields as specified in the populate configuration.
- `state: 'loading' | 'done' | 'error'` - Current state of the hook.
  - `loading` - It is loading and populating the documents.
  - `done` - The documents are populated and ready.
  - `error` - There was an error with populating the documents. Look into the `error` field.
- `loading: boolean` - It is loading. The state is `loading`. This is only a shorthand.
- `error: PouchDB.Error | null` - If there was an error, then this field will contain the error.
  The error is reset to `null` once population was successful.

## Performance Considerations

- Populate operations are optimized with bulk fetching using `allDocs()`
- Results are cached during a single populate operation to avoid duplicate fetches
- Circular reference detection prevents infinite loops
- Maximum recursion depth prevents performance issues
- References to the same document are only fetched once per populate operation

## Example Usage

### Basic Population

```jsx
import React from 'react'
import { usePopulate } from '@aegu/react-pouchdb-hooks'

export function PopulateExample({ rawDocument }) {
  const {
    docs: populatedDoc,
    loading,
    error,
  } = usePopulate(rawDocument, {
    populate: {
      authorId: {
        as: 'author',
      },
      categoryId: {
        as: 'category',
      },
    },
  })

  if (error) {
    return <div>Error: {error.message}</div>
  }

  if (loading) {
    return <div>Populating document...</div>
  }

  return (
    <article>
      <h1>{populatedDoc.title}</h1>
      <p>By: {populatedDoc.author?.name}</p>
      <p>Category: {populatedDoc.category?.name}</p>
      <p>{populatedDoc.content}</p>
    </article>
  )
}
```

### Nested Population

```jsx
import React from 'react'
import { usePopulate } from '@aegu/react-pouchdb-hooks'

export function NestedPopulateExample({ order }) {
  const {
    docs: populatedOrder,
    loading,
    error,
  } = usePopulate(order, {
    populate: {
      customerId: {
        as: 'customer',
        // Nested populate: also populate the customer's company
        populate: {
          companyId: {
            as: 'company',
            populate: {
              industryId: {
                as: 'industry',
              },
            },
          },
        },
      },
      productIds: {
        as: 'products',
        populate: {
          categoryId: {
            as: 'category',
          },
        },
      },
    },
    maxDepth: 3,
  })

  if (error) {
    return <div>Error: {error.message}</div>
  }

  if (loading) {
    return <div>Loading order details...</div>
  }

  return (
    <div>
      <h2>Order #{populatedOrder.orderNumber}</h2>

      <div>
        <h3>Customer Information</h3>
        <p>Name: {populatedOrder.customer?.name}</p>
        <p>Company: {populatedOrder.customer?.company?.name}</p>
        <p>Industry: {populatedOrder.customer?.company?.industry?.name}</p>
      </div>

      <div>
        <h3>Products</h3>
        {populatedOrder.products?.map(product => (
          <div key={product._id}>
            <p>
              {product.name} - {product.category?.name}
            </p>
            <p>Price: ${product.price}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
```

### Population from Different Databases

```jsx
import React from 'react'
import { usePopulate } from '@aegu/react-pouchdb-hooks'

export function CrossDatabasePopulate({ userDocument }) {
  const {
    docs: populatedUser,
    loading,
    error,
  } = usePopulate(userDocument, {
    populate: {
      companyId: {
        as: 'company',
        db: 'companies', // Populate from companies database
      },
      departmentId: {
        as: 'department',
        db: 'organization', // Populate from organization database
      },
      managerId: {
        as: 'manager', // Populate from current database
      },
    },
  })

  if (error) {
    return <div>Error: {error.message}</div>
  }

  if (loading) {
    return <div>Loading user data...</div>
  }

  return (
    <div>
      <h2>{populatedUser.name}</h2>
      <p>Company: {populatedUser.company?.name}</p>
      <p>Department: {populatedUser.department?.name}</p>
      <p>Manager: {populatedUser.manager?.name}</p>
    </div>
  )
}
```

### Populating Arrays of Documents

```jsx
import React from 'react'
import { usePopulate } from '@aegu/react-pouchdb-hooks'

export function PopulateMultipleDocuments({ documents }) {
  const {
    docs: populatedDocs,
    loading,
    error,
  } = usePopulate(documents, {
    populate: {
      authorId: {
        as: 'author',
      },
      categoryId: {
        as: 'category',
      },
    },
  })

  if (error) {
    return <div>Error: {error.message}</div>
  }

  if (loading) {
    return <div>Populating documents...</div>
  }

  return (
    <div>
      <h1>Articles</h1>
      {populatedDocs.map(doc => (
        <article key={doc._id}>
          <h2>{doc.title}</h2>
          <p>By: {doc.author?.name}</p>
          <p>Category: {doc.category?.name}</p>
          <p>{doc.excerpt}</p>
        </article>
      ))}
    </div>
  )
}
```

### Custom Population Logic

```jsx
import React, { useMemo } from 'react'
import { usePopulate } from '@aegu/react-pouchdb-hooks'

export function ConditionalPopulate({ document, includeAuthor = true }) {
  // Dynamically build populate config
  const populateConfig = useMemo(() => {
    const config = {
      categoryId: {
        as: 'category',
      },
    }

    if (includeAuthor) {
      config.authorId = {
        as: 'author',
      }
    }

    return config
  }, [includeAuthor])

  const {
    docs: populatedDoc,
    loading,
    error,
  } = usePopulate(document, {
    populate: populateConfig,
  })

  if (error) {
    return <div>Error: {error.message}</div>
  }

  if (loading) {
    return <div>Loading...</div>
  }

  return (
    <article>
      <h1>{populatedDoc.title}</h1>
      {includeAuthor && <p>By: {populatedDoc.author?.name}</p>}
      <p>Category: {populatedDoc.category?.name}</p>
      <p>{populatedDoc.content}</p>
    </article>
  )
}
```
