import PouchDB from 'pouchdb-core'
import memory from 'pouchdb-adapter-memory'
import find from 'pouchdb-find'
import {
  renderHookForPerformance as renderHook,
  waitForLoadingChange,
} from './test-utils'
import useFind from './useFind'

PouchDB.plugin(memory)
PouchDB.plugin(find)

let myPouch: PouchDB.Database

beforeEach(() => {
  myPouch = new PouchDB('integration-performance-test', { adapter: 'memory' })
})

afterEach(async () => {
  await myPouch.destroy()
})

function createTestDocs() {
  return myPouch.bulkDocs([
    { _id: 'doc1', type: 'test', name: 'Document 1' },
    { _id: 'doc2', type: 'test', name: 'Document 2' },
    { _id: 'doc3', type: 'test', name: 'Document 3' },
    { _id: 'other1', type: 'other', name: 'Other Document 1' },
    { _id: 'other2', type: 'other', name: 'Other Document 2' },
  ])
}

describe('useFind Integration Performance', () => {
  it('should maintain performance with multiple concurrent hooks', async () => {
    await createTestDocs()

    let totalRenderCount = 0

    const { result: result1 } = renderHook(
      () => {
        totalRenderCount++
        return useFind({ selector: { type: 'test' } })
      },
      { pouchdb: myPouch },
    )

    const { result: result2 } = renderHook(
      () => {
        totalRenderCount++
        return useFind({ selector: { type: 'other' } })
      },
      { pouchdb: myPouch },
    )

    await Promise.all([
      waitForLoadingChange(result1, false),
      waitForLoadingChange(result2, false),
    ])

    // Multiple hooks should not cause exponential render growth
    expect(totalRenderCount).toBeLessThanOrEqual(8) // 3-4 renders per hook max

    // Verify both hooks returned correct data
    expect(result1.current.docs).toHaveLength(3)
    expect(result2.current.docs).toHaveLength(2)
    expect(result1.current.loading).toBe(false)
    expect(result2.current.loading).toBe(false)
  })

  it('should maintain backward compatibility with existing patterns', async () => {
    await createTestDocs()

    // Test all the patterns from the existing test suite
    const { result } = renderHook(
      () =>
        useFind({
          selector: { _id: { $gte: 'doc1' } },
          sort: ['_id'],
          limit: 2,
          fields: ['name', 'type'],
        }),
      { pouchdb: myPouch },
    )

    await waitForLoadingChange(result, false)

    // All existing functionality should still work
    expect(result.current.docs).toHaveLength(2)
    expect(result.current.docs[0]).toHaveProperty('name')
    expect(result.current.docs[0]).toHaveProperty('type')
    expect(result.current.docs[0]).not.toHaveProperty('_rev') // fields filtering
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('should handle complex queries with performance optimization', async () => {
    // Create more complex test data
    await myPouch.bulkDocs([
      { _id: 'user1', type: 'user', role: 'admin', active: true },
      { _id: 'user2', type: 'user', role: 'user', active: true },
      { _id: 'user3', type: 'user', role: 'user', active: false },
      { _id: 'post1', type: 'post', author: 'user1', published: true },
      { _id: 'post2', type: 'post', author: 'user2', published: false },
    ])

    let renderCount = 0

    const { result } = renderHook(
      () => {
        renderCount++
        return useFind({
          selector: {
            type: 'user',
            active: true,
            role: { $in: ['admin', 'user'] },
          },
          sort: ['_id'],
          fields: ['type', 'role', 'active'],
        })
      },
      { pouchdb: myPouch },
    )

    await waitForLoadingChange(result, false)

    // Should handle complex queries efficiently (significant improvement!)
    expect(renderCount).toBeLessThanOrEqual(4)
    expect(result.current.docs).toHaveLength(2)
    expect(result.current.docs[0]).toEqual({
      type: 'user',
      role: 'admin',
      active: true,
    })
    expect(result.current.docs[1]).toEqual({
      type: 'user',
      role: 'user',
      active: true,
    })
  })

  it('should maintain performance during subscription updates', async () => {
    await createTestDocs()

    let renderCount = 0
    const { result } = renderHook(
      () => {
        renderCount++
        return useFind({
          selector: { type: 'test' },
          sort: ['_id'],
        })
      },
      { pouchdb: myPouch },
    )

    await waitForLoadingChange(result, false)
    const initialRenderCount = renderCount
    const initialDocsLength = result.current.docs.length

    // Update an existing document that matches the selector
    const docToUpdate = result.current.docs[0]
    // Get the full document with _rev for proper update
    const fullDoc = await myPouch.get(docToUpdate._id)
    await myPouch.put({
      ...fullDoc,
      name: 'Updated Document 1',
    })

    // Wait a bit for subscription to trigger
    await new Promise(resolve => setTimeout(resolve, 100))
    await waitForLoadingChange(result, false)

    // Should handle subscription updates efficiently
    const updateRenderCount = renderCount - initialRenderCount
    expect(updateRenderCount).toBeLessThanOrEqual(2) // Allow for update re-render
    expect(result.current.docs).toHaveLength(initialDocsLength)

    // Find the updated document (it might not be at index 0 after update)
    const updatedDoc = result.current.docs.find(
      doc => doc._id === docToUpdate._id,
    )
    expect(updatedDoc).toBeDefined()
    expect(updatedDoc.name).toBe('Updated Document 1')
  })

  it('should handle index creation and usage efficiently', async () => {
    await createTestDocs()

    let renderCount = 0

    const { result } = renderHook(
      () => {
        renderCount++
        return useFind({
          index: {
            fields: ['type', 'name'],
          },
          selector: { type: 'test' },
          sort: ['type', 'name'],
        })
      },
      { pouchdb: myPouch },
    )

    await waitForLoadingChange(result, false)

    // Should handle index creation without excessive renders (significant improvement!)
    expect(renderCount).toBeLessThanOrEqual(4)
    expect(result.current.docs).toHaveLength(3)
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('should maintain performance with error scenarios', async () => {
    let renderCount = 0

    const { result } = renderHook(
      () => {
        renderCount++
        return useFind({
          selector: { nonexistent_field: 'value' },
        })
      },
      { pouchdb: myPouch },
    )

    await waitForLoadingChange(result, false)

    // Should handle error scenarios efficiently (significant improvement!)
    expect(renderCount).toBeLessThanOrEqual(4)
    expect(result.current.docs).toHaveLength(0)
    expect(result.current.loading).toBe(false)
    // Error handling may vary based on selector validity
  })
})
