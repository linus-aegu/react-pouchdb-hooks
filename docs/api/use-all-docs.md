---
id: use-all-docs
title: useAllDocs
---

## Overview

`useAllDocs` is the hook version of [`db.allDocs()`](https://pouchdb.com/api.html#batch_fetch). It gives you the
ability to fetch multiple documents by their ids.

It doesn't need the creation of a secondary index. This means that it is useable right away, even when not all
documents did sync.

As all hooks, it subscribes to updates.

`useAllDocs` can only be invoked from a component nested inside of a [`<Provider />`](./provider.md).

## Parameters

`useAllDocs` expects a single options object. It has the same options as
[`db.allDocs()`](https://pouchdb.com/api.html#batch_fetch). Options descriptions are copied from the PouchDB API
page.

1. `options: object` - [`db.allDocs()`](https://pouchdb.com/api.html#batch_fetch) option object.
   - `options.include_docs?: boolean` - Include the document itself in each row in the `doc` field. Otherwise by
     default you can only get the `_id` and `_rev` properties.
   - `options.conflicts?: boolean` - Include conflict information in the `_conflicts` field of a doc.
   - `options.attachments?: boolean` - Include attachment data as base64-encoded string.
   - `options.binary?: boolean` - Return attachment data as Blobs, instead of as base64-encoded strings.
   - `options.startkey?: string` - Get documents with IDs in a certain range. The range starts with this key.
   - `options.endkey?: string` - Get documents with IDs in a certain range. The range ends with this key.
   - `options.inclusive_end?: boolean` - Include documents having an ID equal to the given `options.endkey`.
     Default is `true`.
   - `options.limit?: number` - Maximum number of documents to return.
   - `options.skip?: number` - Number of documents to skip before returning (warning: poor performance!).
   - `options.descending?: boolean` - Reverse the order of the output documents. Note that the order of
     `options.startkey` and `options.endkey` is reversed when `descending` is `true`.
   - `options.key?: string` - Only return documents with IDs matching this string key.
   - `options.keys?: string[]` - Fetch multiple known IDs in a single shot.
     - Neither `options.startkey` nor `options.endkey` can be specified with this option.
     - The rows are returned in the same order as in the supplied `keys` array.
     - The row for a deleted document will have the revision ID of the deletion, and an extra key `deleted: true`
       in the `value` property.
     - The row for a nonexistent document will only contain an `error` property with the value `"not_found"`.
     - For more details, see the [`db.allDocs() documentation`](https://pouchdb.com/api.html#batch_fetch) or the
       [CouchDB query options documentation](https://docs.couchdb.org/en/stable/api/ddoc/views.html#db-design-design-doc-view-view-name).
   - `options.update_seq?: boolean` - Include an `update_seq` value indicating which sequence id of the underlying
     database the view reflects.
   - `options.db?: string` - Selects the database to be used. The database is selected by it's name/key.
     The special key `"_default"` selects the _default database_. Defaults to `"_default"`.
   - `options.populate?: PopulateConfig` - Configuration for populating referenced documents. See [Populate Feature](#populate-feature) below.
   - `options.maxDepth?: number` - Maximum recursion depth for nested populate operations. Default is `3`.

> `keys` and `populate` are checked for equality with a deep equal algorithm.
> And only if they differentiate by _value_ will they cause a new query be made.

## Populate Feature

The populate feature allows you to automatically fetch and include referenced documents in your query results. This is useful for relational-style data where documents reference other documents by ID.

### PopulateConfig

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
```

### Performance Considerations

- Populate operations are optimized with bulk fetching using `allDocs()`
- Results are cached during a single populate operation
- Circular reference detection prevents infinite loops
- Maximum recursion depth prevents performance issues

## Result

`useAllDocs` results an object with those fields:

- `rows: object[]` - Array of objects that contain the requested information. Empty during the first fetch or
  during an error. Each object has following fields:
  - `id: string` - `_id` of the document.
  - `key: string` - `_id` of the document.
  - `value: object` - Object with one field:
    - `value.rev: string` - `_rev` of the document.
  - `doc?: PouchDB.Core.Document` - If `options.include_docs` was `true`, this field will contain the document. And
    if `attachments` is also `true`, the document will contain the attachment data in the `"_attachments"` field.
    **When using populate, documents will include the populated fields as specified in the populate configuration.**
- `offset: number` - The `skip` provided.
- `total_rows: number` - The total number of non-deleted documents in the database.
- `update_seq?: number | string` - If `update_seq` is `true`, this will contain the sequence id of the underlying
  database.
- `state: 'loading' | 'done' | 'error'` - Current state of the hook.
  - `loading` - It is loading the documents. Or it is loading the updated version of them.
  - `done` - The documents are loaded, and no update is being loaded.
  - `error` - There was an error with fetching the documents. Look into the `error` field.
- `loading: boolean` - It is loading. The state is `loading`. This is only a shorthand.
- `error: PouchDB.Error | null` - If there was an error, then this field will contain the error. The error is reset
  to `null` once a fetch was successful.

## Example Usage

`useAllDocs` is useful for many operations where you need to load multiple documents.

### Prefix search

If you sort your documents by `_id`, then you can use `useAllDocs` to load all documents with a prefix. Read more
at the [12 pro tips](https://pouchdb.com/2014/06/17/12-pro-tips-for-better-code-with-pouchdb.html) section 7.

The `'\ufff0'` is a special high Unicode character, that is sorted after most others.

If a document, that fall into this range, gets added, updated or deleted, then the `rows` will be updated
accordingly.

```jsx
import React from 'react'
import { useAllDocs } from '@aegu/react-pouchdb-hooks'
import { ErrorMessage } from './ErrorMessage'

export function Comments({ id }) {
  const commentsPrefix = `comments_${id}`
  const { rows, loading, state, error } = useAllDocs({
    startkey: commentsPrefix,
    endkey: commentsPrefix + '\ufff0',
    include_docs: true,
  })

  if (state === 'error') {
    return <ErrorMessage error={error} />
  }

  if (loading && rows.length === 0) {
    return null
  }

  return (
    <div>
      <h4>Comments</h4>

      <div>
        {rows.map(row => (
          <section key={row.id}>
            <h5>{row.doc.username} commented</h5>
            {!row.value.rev.startsWith('1-') && <span>Edited</span>}
            <p>{row.doc.comment}</p>
          </section>
        ))}
      </div>
    </div>
  )
}
```

### Load multiple documents by id

`useAllDocs` can also load multiple documents by their IDs.

```jsx
import React from 'react'
import { useAllDocs } from '@aegu/react-pouchdb-hooks'
import { ErrorMessage } from './ErrorMessage'

export function Related({ doc }) {
  const { rows, loading, state, error } = useAllDocs({
    keys: doc.related || [], // doc.related is an Array of IDs.
    include_docs: true,
  })

  if (state === 'error') {
    return <ErrorMessage error={error} />
  }

  if (loading && rows.length === 0) {
    return null
  }

  return (
    <div>
      <h4>Read more</h4>

      <ul>
        {rows.map(row => (
          <li key={row.id}>{row.doc.title}</li>
        ))}
      </ul>
    </div>
  )
}
```

### Descending

It is imported to remember that `options.startkey` and `options.endkey` switch, when `options.descending` is `true`.

```jsx
import React from 'react'
import { useAllDocs } from '@aegu/react-pouchdb-hooks'
import ms from 'milliseconds'
import { ErrorMessage } from './ErrorMessage'

export function LastBookings() {
  const midnight = new Date()
  midnight.setHours(0)
  midnight.setMinutes(0)
  midnight.setSeconds(0)

  // this goes from midnight to 7 days ago.
  const { rows, loading, state, error } = useAllDocs({
    // start midnight
    startkey: 'bookings_' + midnight.toJSON(),
    // End at endkey
    // the date 7 days ago is the end.
    endkey: 'bookings_' + new Date(midnight.getTime() - ms.days(7)).toJSON(),
    include_docs: true,
    descending: true,
  })

  if (state === 'error') {
    return <ErrorMessage error={error} />
  }

  if (loading && rows.length === 0) {
    return null
  }

  return (
    <div>
      <h4>Bookings</h4>

      <ul>
        {rows.map(row => (
          <li key={row.id}>
            {row.doc.amount}€ from {row.doc.partner}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

### Select a database

```jsx
import React from 'react'
import { useAllDocs } from '@aegu/react-pouchdb-hooks'
import { ErrorMessage } from './ErrorMessage'

export function Comments({ id, isLocalReady }) {
  const commentsPrefix = `comments_${id}`
  const { rows, loading, state, error } = useAllDocs({
    startkey: commentsPrefix,
    endkey: commentsPrefix + '\ufff0',
    include_docs: true,
    // Select the database used
    db: isLocalReady ? 'local' : 'remote',
  })

  if (state === 'error') {
    return <ErrorMessage error={error} />
  }

  if (loading && rows.length === 0) {
    return null
  }

  return (
    <div>
      <h4>Comments</h4>

      <div>
        {rows.map(row => (
          <section key={row.id}>
            <h5>{row.doc.username} commented</h5>
            {!row.value.rev.startsWith('1-') && <span>Edited</span>}
            <p>{row.doc.comment}</p>
          </section>
        ))}
      </div>
    </div>
  )
}
```

### Using Populate with Multiple Documents

```jsx
import React from 'react'
import { useAllDocs } from '@aegu/react-pouchdb-hooks'

export function UserList() {
  const { rows, loading, error } = useAllDocs({
    startkey: 'user_',
    endkey: 'user_\ufff0',
    include_docs: true,
    populate: {
      companyId: {
        as: 'company',
      },
      departmentId: {
        as: 'department',
        db: 'organization',
      },
    },
  })

  if (error) {
    return <div>Error: {error.message}</div>
  }

  if (loading && rows.length === 0) {
    return <div>Loading users...</div>
  }

  return (
    <div>
      <h1>Users</h1>
      {rows.map(row => (
        <div key={row.id}>
          <h3>{row.doc.name}</h3>
          <p>Company: {row.doc.company?.name}</p>
          <p>Department: {row.doc.department?.name}</p>
          <p>Email: {row.doc.email}</p>
        </div>
      ))}
    </div>
  )
}
```

### Populate with Specific Keys

```jsx
import React from 'react'
import { useAllDocs } from '@aegu/react-pouchdb-hooks'

export function OrderDetails({ orderIds }) {
  const { rows, loading, error } = useAllDocs({
    keys: orderIds,
    include_docs: true,
    populate: {
      customerId: {
        as: 'customer',
        db: 'users',
      },
      productIds: {
        as: 'products',
        db: 'catalog',
        // Nested populate for product categories
        populate: {
          categoryId: {
            as: 'category',
          },
        },
      },
    },
    maxDepth: 2,
  })

  if (error) {
    return <div>Error: {error.message}</div>
  }

  if (loading && rows.length === 0) {
    return <div>Loading orders...</div>
  }

  return (
    <div>
      <h1>Order Details</h1>
      {rows.map(row => (
        <div key={row.id}>
          <h3>Order #{row.doc.orderNumber}</h3>
          <p>Customer: {row.doc.customer?.name}</p>
          <div>
            <h4>Products:</h4>
            {row.doc.products?.map(product => (
              <div key={product._id}>
                <span>{product.name}</span>
                <span> - {product.category?.name}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
```
