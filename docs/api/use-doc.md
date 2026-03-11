---
id: use-doc
title: useDoc
---

## Overview

To read a single document use `useDoc`. It is the hook version of
[`db.get()`](https://pouchdb.com/api.html#fetch_document). It also subscripts to updates for that document.

`useDoc` can only be invoked from a component nested inside of a [`<Provider />`](./provider.md).

## Parameters

`useDoc` has the same options as [`db.get()`](https://pouchdb.com/api.html#fetch_document), with the only exception
of `options.open_revs` not being supported. Options descriptions are copied from the PouchDB API page.

1. `id: string` - \_id of the document.
2. `options?: object | null` - [`db.get()`](https://pouchdb.com/api.html#fetch_document) option object. All options
   except `options.open_revs` are allowed.
   - `options.rev?: string` - If set: fetch specific revision of a document. It defaults to winning revision.
   - `options.revs?: boolean` - Include revision history of the document.
   - `options.revs_info?: boolean` - Include a list of revisions of the document, and their availability.
   - `options.conflicts?: boolean` - If specified, conflicting leaf revisions will be attached in `_conflicts`
     array.
   - `options.attachments?: boolean` - Include attachment data.
   - `options.binary?: boolean` - Only evaluated when `attachments` is `true`. Return attachment data as
     Blobs/Buffers, instead of as base64-encoded strings.
   - `options.latest?: boolean` - Forces retrieving latest "leaf" revision, no matter what rev was requested.
   - `options.db?: string` - Selects the database to be used. The database is selected by it's name/key.
     The special key `"_default"` selects the _default database_. Defaults to `"_default"`.
   - `options.populate?: PopulateConfig` - Configuration for populating referenced documents. See [Populate Feature](#populate-feature) below.
   - `options.maxDepth?: number` - Maximum recursion depth for nested populate operations. Default is `3`.
3. `initialValue?: Object | function` - Optional initial value of `doc` result. Has the same behavior as
   `useState`'s initialValue. If used then the `options` object must be set.

## Populate Feature

The populate feature allows you to automatically fetch and include referenced documents in your document result. This is useful for relational-style data where documents reference other documents by ID.

### PopulateConfig

The `populate` option accepts a configuration object where:

- **Key**: The field name in your document that contains a reference ID
- **Value**: Configuration for how to populate that field

```typescript
interface PopulateFieldConfig {
  as: string // Field name where populated document will be stored
  db?: string // Database name if different from current (optional)
  populate?: PopulateConfig // Nested populate configuration (recursive)
  fields?: string[] // Array of fields to include from populated document
  query?: (values: string[]) => {
    // Custom query function for non-_id lookups (foreign key support)
    selector: PouchDB.Find.Selector
    limit?: number
    use_index?: string | [string, string]
  }
}

interface PopulateConfig {
  [fieldName: string]: PopulateFieldConfig
}
```

### Performance Considerations

- Populate operations are optimized with bulk fetching using `allDocs()` (ID-based) or `find()` (query-based)
- Results are cached during a single populate operation
- Circular reference detection prevents infinite loops
- Maximum recursion depth prevents performance issues

## Result

`useDoc` results an object with those fields:

- `doc: PouchDB.Core.Document | null` - The requested document. If there is an error, or its still loading the doc
  is `null` or the `initialValue`. **When using populate, the document will include the populated fields as specified in the populate configuration.**
- `state: 'loading' | 'done' | 'error'` - Current state of the hook.
  - `loading` - It is loading the document. Or it is loading the updated version of it.
  - `done` - The document was loaded, and no update is being loaded.
  - `error` - There was an error with fetching the document. Look into the `error` field.
- `loading: boolean` - It is loading. The state is `loading`. This is only a shorthand.
- `error: PouchDB.Error | null` - If there was an error, then this field will contain the error. The error is reset
  to `null` once a document was successfully loaded.

## Example Usage

`useDoc` is for the use case of reading one document.

### Getting a document

```jsx
import React from 'react'
import ReactMarkdown from 'react-markdown'
import { useDoc } from '@aegu/react-pouchdb-hooks'
import { ErrorMessage } from './ErrorMessage'

export function PostViewer({ id }) {
  const { doc, loading, state, error } = useDoc(id)

  if (state === 'error') {
    return <ErrorMessage error={error} />
  }

  if (loading && doc == null) {
    return (
      <article>
        <hgroup>
          <h1>loading ...</h1>
        </hgroup>
      </article>
    )
  }

  return (
    <article>
      <hgroup>
        <h1>{doc.title}</h1>
        <h2>by {doc.author}</h2>
      </hgroup>
      <ReactMarkdown source={doc.text} />
    </article>
  )
}
```

### Options

```jsx
import React from 'react'
import ReactMarkdown from 'react-markdown'
import { useDoc } from '@aegu/react-pouchdb-hooks'
import { ErrorMessage } from './ErrorMessage'

import { DocRenderer } from './DocRenderer'

export function ConflictResolver({ id }) {
  const { doc: winning, loading: winningIsLoading } = useDoc(id, {
    conflicts: true,
  })

  const { doc: loosing, loading: loosingIsLoading } = useDoc(id, {
    rev: winning._conflict.length > 0 ? winning._conflict[0] : undefined,
  })

  if (winningIsLoading || loosingIsLoading) {
    return <div>loading ...</div>
  }

  if (winning._rev === loosing._rev) {
    return <div>No conflict!</div>
  }

  return (
    <div>
      <DocRenderer doc={winning} />
      <DocRenderer doc={loosing} />
    </div>
  )
}
```

### With initial value

If the `initialValue` is set, then the `options` must also be set (it can be an `object` or `null`).

```jsx
import React from 'react'
import ReactMarkdown from 'react-markdown'
import { useDoc } from '@aegu/react-pouchdb-hooks'
import { ErrorMessage } from './ErrorMessage'

export function PostViewer({ id }) {
  const { doc, state, error } = useDoc(id, null, () => ({
    _id: id,
    title: '...',
    author: '...',
    text: 'loading ...',
  }))

  if (state === 'error') {
    return <ErrorMessage error={error} />
  }

  return (
    <article>
      <hgroup>
        <h1>{doc.title}</h1>
        <h2>by {doc.author}</h2>
      </hgroup>
      <ReactMarkdown source={doc.text} />
    </article>
  )
}
```

The `initialValue` can also be used for a blue print of documents. If no doc was fount, use the
initial value and edit it. Once it is saved/created, `useDoc` will fetch the newly saved doc.

### Select a database

```jsx
import React from 'react'
import ReactMarkdown from 'react-markdown'
import { useDoc } from '@aegu/react-pouchdb-hooks'
import { ErrorMessage } from './ErrorMessage'

export function PostViewer({ id, isLocalReady }) {
  const { doc, loading, state, error } = useDoc(id, {
    db: isLocalReady ? 'local' : 'remote',
  })

  if (state === 'error') {
    return <ErrorMessage error={error} />
  }

  if (loading && doc == null) {
    return (
      <article>
        <hgroup>
          <h1>loading ...</h1>
        </hgroup>
      </article>
    )
  }

  return (
    <article>
      <hgroup>
        <h1>{doc.title}</h1>
        <h2>by {doc.author}</h2>
      </hgroup>
      <ReactMarkdown source={doc.text} />
    </article>
  )
}
```

### Using Populate for Referenced Documents

```jsx
import React from 'react'
import { useDoc } from '@aegu/react-pouchdb-hooks'

export function UserProfile({ userId }) {
  const {
    doc: user,
    loading,
    error,
  } = useDoc(userId, {
    populate: {
      companyId: {
        as: 'company',
        // Nested populate: also populate the company's industry
        populate: {
          industryId: {
            as: 'industry',
          },
        },
      },
      managerId: {
        as: 'manager',
      },
      departmentId: {
        as: 'department',
        db: 'organization', // Populate from a different database
      },
    },
    maxDepth: 2,
  })

  if (error) {
    return <div>Error loading user: {error.message}</div>
  }

  if (loading && !user) {
    return <div>Loading user profile...</div>
  }

  return (
    <div>
      <h1>{user.name}</h1>
      <p>Email: {user.email}</p>
      <p>Company: {user.company?.name}</p>
      <p>Industry: {user.company?.industry?.name}</p>
      <p>Manager: {user.manager?.name}</p>
      <p>Department: {user.department?.name}</p>
    </div>
  )
}
```

### Populate with Initial Value

```jsx
import React from 'react'
import { useDoc } from '@aegu/react-pouchdb-hooks'

export function PostEditor({ postId }) {
  const {
    doc: post,
    loading,
    error,
  } = useDoc(
    postId,
    {
      populate: {
        authorId: {
          as: 'author',
        },
        categoryId: {
          as: 'category',
        },
      },
    },
    () => ({
      _id: postId,
      title: 'New Post',
      content: '',
      authorId: null,
      categoryId: null,
      // Initial populated values
      author: { name: 'Loading...' },
      category: { name: 'Uncategorized' },
    }),
  )

  if (error) {
    return <div>Error: {error.message}</div>
  }

  return (
    <form>
      <h2>Edit Post: {post.title}</h2>
      <p>Author: {post.author?.name}</p>
      <p>Category: {post.category?.name}</p>
      <textarea value={post.content} readOnly />
    </form>
  )
}
```
