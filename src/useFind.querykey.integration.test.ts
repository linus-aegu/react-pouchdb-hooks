import PouchDB from 'pouchdb-core'
import memory from 'pouchdb-adapter-memory'
import find from 'pouchdb-find'

import { renderHook, waitForLoadingChange } from './test-utils'
import useFind from './useFind'

PouchDB.plugin(memory)
PouchDB.plugin(find)

let myPouch: PouchDB.Database

beforeEach(() => {
  myPouch = new PouchDB('querykey-integration-test', { adapter: 'memory' })
})

afterEach(async () => {
  await myPouch.destroy()
})

function createDocs() {
  return myPouch.bulkDocs([
    {
      _id: 'box1',
      type: 'BoxType',
      name: 'Small Box',
      status: 'active',
    },
    {
      _id: 'box2',
      type: 'BoxType',
      name: 'Large Box',
      status: 'active',
    },
    {
      _id: 'box3',
      type: 'BoxType',
      name: 'Medium Box',
      status: 'inactive',
    },
  ])
}

describe('queryKey Integration: Query Optimization', () => {
  test('queryKey prevents unnecessary queries when objects are recreated', async () => {
    await createDocs()

    let queryExecutionCount = 0

    // Mock to count actual PouchDB find calls
    const originalFind = myPouch.find
    myPouch.find = jest.fn(async options => {
      queryExecutionCount++
      return originalFind.call(myPouch, options)
    }) as any

    // Test that stable queryKey prevents re-queries
    const { result, rerender } = renderHook(
      (sortOrder: 'asc' | 'desc') => {
        // ✅ Objects are recreated each render (common pattern)
        const selector = {
          type: 'BoxType',
          status: 'active',
        }

        const sort = [{ name: sortOrder }]

        // ✅ queryKey provides stable identity regardless of object recreation
        return useFind({
          selector,
          sort,
          queryKey: ['boxTypes', sortOrder],
        })
      },
      {
        initialProps: 'asc' as const,
        pouchdb: myPouch,
      }
    )

    await waitForLoadingChange(result, false)

    const initialQueryCount = queryExecutionCount

    // Re-render with SAME logical data (same queryKey)
    rerender('asc') // Same queryKey should not trigger new query
    rerender('asc') // Same queryKey should not trigger new query
    rerender('asc') // Same queryKey should not trigger new query

    await new Promise(resolve => setTimeout(resolve, 100))

    // ✅ No additional queries should have been executed
    expect(queryExecutionCount - initialQueryCount).toBe(0)

    // Now change the queryKey
    rerender('desc') // Different queryKey should trigger new query
    await waitForLoadingChange(result, false)

    // ✅ Exactly 1 additional query for the new sort order
    expect(queryExecutionCount - initialQueryCount).toBe(1)

    myPouch.find = originalFind
  })

  test('different queryKey triggers new query', async () => {
    await createDocs()

    let queryExecutionCount = 0
    const originalFind = myPouch.find
    myPouch.find = jest.fn(async options => {
      queryExecutionCount++
      return originalFind.call(myPouch, options)
    }) as any

    const { result, rerender } = renderHook(
      (status: string) => {
        return useFind({
          selector: { type: 'BoxType', status },
          queryKey: ['boxTypes', status],
        })
      },
      {
        initialProps: 'active',
        pouchdb: myPouch,
      }
    )

    await waitForLoadingChange(result, false)
    const initialQueryCount = queryExecutionCount

    // Change the queryKey (different status)
    rerender('inactive')
    await waitForLoadingChange(result, false)

    // Should trigger exactly 1 new query
    expect(queryExecutionCount - initialQueryCount).toBe(1)

    myPouch.find = originalFind
  })

  test('Real-world scenario: component with complex filters', async () => {
    // Create realistic data
    await myPouch.bulkDocs([
      {
        _id: 'box1',
        type: 'BoxType',
        name: 'Small Electronics Box',
        category: 'electronics',
        status: 'active',
      },
      {
        _id: 'box2',
        type: 'BoxType',
        name: 'Large Electronics Box',
        category: 'electronics',
        status: 'active',
      },
      {
        _id: 'box3',
        type: 'BoxType',
        name: 'Small Clothing Box',
        category: 'clothing',
        status: 'active',
      },
      {
        _id: 'box4',
        type: 'BoxType',
        name: 'Archive Box',
        category: 'electronics',
        status: 'inactive',
      },
    ])

    let queryCount = 0
    const originalFind = myPouch.find
    myPouch.find = jest.fn(async options => {
      queryCount++
      return originalFind.call(myPouch, options)
    }) as any

    // Simulate component with complex filter objects
    const { result, rerender } = renderHook(
      (props: {
        selectedCategory: string
        includeInactive: boolean
        version: number
      }) => {
        // Complex filter objects recreated each render
        const filters = {
          type: 'BoxType',
          category: props.selectedCategory,
          ...(props.includeInactive ? {} : { status: 'active' }),
        }

        return useFind({
          selector: filters,
          queryKey: [
            'boxTypes',
            props.selectedCategory,
            props.includeInactive,
            props.version,
          ],
        })
      },
      {
        initialProps: {
          selectedCategory: 'electronics',
          includeInactive: false,
          version: 1,
        },
        pouchdb: myPouch,
      }
    )

    await waitForLoadingChange(result, false)
    expect(result.current.docs).toHaveLength(2) // 2 active electronics boxes

    const queriesAfterLoad = queryCount

    // Multiple re-renders with same queryKey should not cause additional queries
    rerender({
      selectedCategory: 'electronics',
      includeInactive: false,
      version: 1,
    })
    rerender({
      selectedCategory: 'electronics',
      includeInactive: false,
      version: 1,
    })
    rerender({
      selectedCategory: 'electronics',
      includeInactive: false,
      version: 1,
    })

    await new Promise(resolve => setTimeout(resolve, 100))

    // ✅ Should not cause additional queries
    expect(queryCount - queriesAfterLoad).toBe(0)

    // Now change the queryKey
    rerender({
      selectedCategory: 'clothing',
      includeInactive: false,
      version: 1,
    })
    await waitForLoadingChange(result, false)

    // ✅ Should cause exactly 1 additional query for the new filter
    expect(queryCount - queriesAfterLoad).toBe(1)
    expect(result.current.docs).toHaveLength(1) // 1 clothing box

    myPouch.find = originalFind
  })

  test('auto-generated queryKey works without explicit key', async () => {
    await createDocs()

    let queryCount = 0
    const originalFind = myPouch.find
    myPouch.find = jest.fn(async options => {
      queryCount++
      return originalFind.call(myPouch, options)
    }) as any

    // Test that auto-generated queryKey also optimizes queries
    const { result, rerender } = renderHook(
      (status: string) => {
        // No explicit queryKey - should auto-generate
        return useFind({
          selector: { type: 'BoxType', status },
          // queryKey auto-generated from options
        })
      },
      {
        initialProps: 'active',
        pouchdb: myPouch,
      }
    )

    await waitForLoadingChange(result, false)
    const initialQueryCount = queryCount

    // Re-render with same data should not trigger new query
    rerender('active')
    rerender('active')
    rerender('active')

    await new Promise(resolve => setTimeout(resolve, 100))

    // Auto-generated queryKey should prevent unnecessary queries
    expect(queryCount - initialQueryCount).toBe(0)

    myPouch.find = originalFind
  })
})
