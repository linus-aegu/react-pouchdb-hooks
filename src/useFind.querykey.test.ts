import PouchDB from 'pouchdb-core'
import memory from 'pouchdb-adapter-memory'
import find from 'pouchdb-find'

import { renderHook, waitForLoadingChange, act, waitFor } from './test-utils'
import useFind from './useFind'

PouchDB.plugin(memory)
PouchDB.plugin(find)

let myPouch: PouchDB.Database

beforeEach(() => {
  myPouch = new PouchDB('querykey-test', { adapter: 'memory' })
})

afterEach(async () => {
  await myPouch.destroy()
})

function createDocs() {
  return myPouch.bulkDocs([
    {
      _id: 'doc1',
      type: 'test',
      name: 'Document 1',
      status: 'active',
    },
    {
      _id: 'doc2',
      type: 'test',
      name: 'Document 2',
      status: 'pending',
    },
    {
      _id: 'doc3',
      type: 'other',
      name: 'Document 3',
      status: 'active',
    },
  ])
}

describe('useFind queryKey functionality', () => {
  test('should work without explicit queryKey (backward compatibility)', async () => {
    await createDocs()

    const { result } = renderHook(
      () =>
        useFind({
          selector: { _id: { $gte: 'doc1' } },
        }),
      { pouchdb: myPouch },
    )

    await waitForLoadingChange(result, false)

    expect(result.current.docs).toHaveLength(3)
    expect(result.current.docs[0]._id).toBe('doc1')
    expect(result.current.docs[1]._id).toBe('doc2')
    expect(result.current.docs[2]._id).toBe('doc3')
  })

  test('should accept string queryKey', async () => {
    await createDocs()

    const { result } = renderHook(
      () =>
        useFind({
          selector: { _id: { $gte: 'doc1', $lt: 'doc3' } },
          queryKey: 'my-custom-test-query',
        }),
      { pouchdb: myPouch },
    )

    await waitForLoadingChange(result, false)

    expect(result.current.docs).toHaveLength(2)
    expect(result.current.docs[0]._id).toBe('doc1')
    expect(result.current.docs[1]._id).toBe('doc2')
  })

  test('should accept array queryKey', async () => {
    await createDocs()

    const { result } = renderHook(
      () =>
        useFind({
          selector: { _id: { $gte: 'doc1', $lt: 'doc3' } },
          queryKey: ['test-docs', 'sorted-by-id'],
        }),
      { pouchdb: myPouch },
    )

    await waitForLoadingChange(result, false)

    expect(result.current.docs).toHaveLength(2)
    expect(result.current.docs[0]._id).toBe('doc1')
    expect(result.current.docs[1]._id).toBe('doc2')
  })

  test('should work with complex selectors', async () => {
    await createDocs()

    const { result } = renderHook(
      () =>
        useFind({
          selector: {
            type: 'test',
            status: { $in: ['active', 'pending'] },
          },
          queryKey: ['test-docs', 'active-or-pending'],
        }),
      { pouchdb: myPouch },
    )

    await waitForLoadingChange(result, false)

    expect(result.current.docs).toHaveLength(2)
    expect(
      result.current.docs.every(doc =>
        ['active', 'pending'].includes(doc.status),
      ),
    ).toBe(true)
  })

  test('should re-query when queryKey changes', async () => {
    await createDocs()

    const { result, rerender } = renderHook(
      (queryKey: string) =>
        useFind({
          selector: { _id: { $gte: 'doc1', $lt: 'doc3' } },
          queryKey,
        }),
      {
        initialProps: 'query-v1',
        pouchdb: myPouch,
      },
    )

    await waitForLoadingChange(result, false)
    expect(result.current.docs).toHaveLength(2)

    act(() => {
      rerender('query-v2')
    })

    await waitForLoadingChange(result, false)
    expect(result.current.docs).toHaveLength(2) // Same data but new query
  })

  test('should work with TanStack Query style keys', async () => {
    await createDocs()

    const userId = 'user123'
    const page = 1
    const filters = { status: 'active' }

    const { result } = renderHook(
      () =>
        useFind({
          selector: { type: 'test', ...filters },
          queryKey: ['docs', 'by-user', userId, 'page', page, filters],
        }),
      { pouchdb: myPouch },
    )

    await waitForLoadingChange(result, false)

    expect(result.current.docs).toHaveLength(1)
    expect(result.current.docs[0].name).toBe('Document 1')
  })

  test('should maintain subscription reactivity with queryKey', async () => {
    await createDocs()

    const { result } = renderHook(
      () =>
        useFind({
          selector: { type: 'test' },
          queryKey: 'reactive-test',
        }),
      { pouchdb: myPouch },
    )

    await waitForLoadingChange(result, false)
    expect(result.current.docs).toHaveLength(2)

    // Add new document that matches selector
    await act(async () => {
      await myPouch.put({
        _id: 'doc4',
        type: 'test',
        name: 'Document 4',
        status: 'active',
      })
    })

    // Wait for subscription to update the result
    await waitFor(
      () => {
        expect(result.current.docs).toHaveLength(3)
        expect(result.current.docs.some(doc => doc.name === 'Document 4')).toBe(
          true,
        )
      },
      { timeout: 5000 },
    )
  })

  test('should support queryKey configuration options', async () => {
    await createDocs()

    const { result } = renderHook(
      () =>
        useFind({
          selector: { type: 'test' },
          queryKey: 'config-test',
        }),
      { pouchdb: myPouch },
    )

    await waitForLoadingChange(result, false)

    // Options should not break functionality
    expect(result.current.docs).toHaveLength(2)
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })
})

describe('queryKey query optimization', () => {
  test('should prevent unnecessary queries with stable queryKey', async () => {
    await createDocs()

    let queryCount = 0
    const originalFind = myPouch.find
    myPouch.find = jest.fn(async options => {
      queryCount++
      return originalFind.call(myPouch, options)
    }) as jest.MockedFunction<typeof myPouch.find>

    const { result, rerender } = renderHook(
      (status: string) => {
        return useFind({
          selector: { type: 'test', status },
          queryKey: ['test-docs', status],
        })
      },
      {
        initialProps: 'active',
        pouchdb: myPouch,
      },
    )

    await waitForLoadingChange(result, false)
    const initialQueryCount = queryCount

    // Re-render with same queryKey should not trigger additional query
    rerender('active')
    rerender('active')

    await new Promise(resolve => setTimeout(resolve, 100))

    expect(queryCount - initialQueryCount).toBe(0)

    myPouch.find = originalFind
  })

  test('should trigger new query when queryKey changes', async () => {
    await createDocs()

    let queryCount = 0
    const originalFind = myPouch.find
    myPouch.find = jest.fn(async options => {
      queryCount++
      return originalFind.call(myPouch, options)
    }) as jest.MockedFunction<typeof myPouch.find>

    const { result, rerender } = renderHook(
      (status: string) => {
        return useFind({
          selector: { type: 'test', status },
          queryKey: ['test-docs', status],
        })
      },
      {
        initialProps: 'active',
        pouchdb: myPouch,
      },
    )

    await waitForLoadingChange(result, false)
    const initialQueryCount = queryCount

    // Different queryKey should trigger new query
    rerender('pending')
    await waitForLoadingChange(result, false)

    expect(queryCount - initialQueryCount).toBe(1)

    myPouch.find = originalFind
  })
})
