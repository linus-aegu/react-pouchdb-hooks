import PouchDB from 'pouchdb-core'
import memory from 'pouchdb-adapter-memory'
import find from 'pouchdb-find'

import {
  renderHook,
  renderHookWithMultiDbContext,
  waitForNextUpdate,
  waitForLoadingChange,
  act,
  sleep,
} from './test-utils'
import useFind, { FindHookIndexOption } from './useFind'
import type { PopulateConfig } from './populate-types'

PouchDB.plugin(memory)
PouchDB.plugin(find)

let myPouch: PouchDB.Database

beforeEach(() => {
  myPouch = new PouchDB('test', { adapter: 'memory' })
})

afterEach(async () => {
  await myPouch.destroy()
})

function createDocs() {
  return myPouch.bulkDocs([
    {
      _id: 'TOS',
      name: 'The Original Series',
      captain: 'James T. Kirk',
      aired: 1966,
    },
    {
      _id: 'TNG',
      name: 'The Next Generation',
      captain: 'Jean-Luc Picard',
      aired: 1987,
    },
    {
      _id: 'DS9',
      name: 'Deep Space Nine',
      captain: 'Benjamin Sisko',
      aired: 1993,
    },
    { _id: 'VOY', name: 'Voyager', captain: 'Kathryn Janeway', aired: 1995 },
    { _id: 'ENT', name: 'Enterprise', captain: 'Jonathan Archer', aired: 2001 },
  ])
}

describe('by id', () => {
  test('should return docs sorted by _id', async () => {
    await createDocs()

    const { result } = renderHook(
      () =>
        useFind({
          selector: { _id: { $gte: 'DS9' } },
          sort: ['_id'],
        }),
      {
        pouchdb: myPouch,
      },
    )

    expect(result.current.docs).toEqual([])
    expect(result.current.warning).toBeFalsy()
    expect(result.current.loading).toBeTruthy()
    expect(result.current.state).toBe('loading')
    expect(result.current.error).toBeNull()

    await waitForLoadingChange(result, false)

    expect(result.current.docs).toEqual([
      {
        _id: 'DS9',
        _rev: expect.anything(),
        name: 'Deep Space Nine',
        captain: 'Benjamin Sisko',
        aired: 1993,
      },
      {
        _id: 'ENT',
        _rev: expect.anything(),
        name: 'Enterprise',
        captain: 'Jonathan Archer',
        aired: 2001,
      },
      {
        _id: 'TNG',
        _rev: expect.anything(),
        name: 'The Next Generation',
        captain: 'Jean-Luc Picard',
        aired: 1987,
      },
      {
        _id: 'TOS',
        _rev: expect.anything(),
        name: 'The Original Series',
        captain: 'James T. Kirk',
        aired: 1966,
      },
      {
        _id: 'VOY',
        _rev: expect.anything(),
        name: 'Voyager',
        captain: 'Kathryn Janeway',
        aired: 1995,
      },
    ])
    expect(result.current.warning).toBeFalsy()
    expect(result.current.loading).toBeFalsy()
    expect(result.current.state).toBe('done')
    expect(result.current.error).toBeNull()
  })

  test('should subscribe to changes', async () => {
    await createDocs()

    const { result } = renderHook(
      () =>
        useFind({
          selector: { _id: { $gte: 'DS9' } },
          sort: ['_id'],
        }),
      {
        pouchdb: myPouch,
      },
    )

    await waitForLoadingChange(result, false)

    expect(result.current.docs).toHaveLength(5)
    expect(result.current.loading).toBeFalsy()

    act(() => {
      myPouch.put({
        _id: 'AA',
        other: 'value',
      })
    })

    await sleep(10)
    expect(result.current.loading).toBeFalsy()
    expect(result.current.docs).toHaveLength(5)

    act(() => {
      myPouch.put({
        _id: 'zzz',
        moar: 42,
      })
    })

    await waitForLoadingChange(result, false)
    await waitForNextUpdate(result)

    expect(result.current.docs).toHaveLength(6)
  })

  test('should re-query if a change did happen while a query is underway', async () => {
    await createDocs()

    const { result } = renderHook(
      () =>
        useFind({
          selector: { _id: { $gte: 'DS9' } },
          sort: ['_id'],
        }),
      {
        pouchdb: myPouch,
      },
    )

    await waitForLoadingChange(result, false)

    expect(result.current.docs).toHaveLength(5)
    expect(result.current.loading).toBeFalsy()

    act(() => {
      myPouch.put({
        _id: 'Jolly Roger',
        captain: 'Hook',
      })
    })

    act(() => {
      myPouch.put({ _id: 'test', captain: 'Ching Shih (石陽)' })
    })

    await waitForNextUpdate(result)

    await waitForLoadingChange(result, false)

    expect(result.current.loading).toBeFalsy()
    expect(result.current.docs).toHaveLength(7)
  })

  test('should handle the deletion of docs in the result', async () => {
    await createDocs()

    const { result } = renderHook(
      () =>
        useFind({
          selector: { _id: { $gte: 'DS9' } },
          sort: ['_id'],
        }),
      {
        pouchdb: myPouch,
      },
    )

    await waitForLoadingChange(result, false)

    expect(result.current.docs).toHaveLength(5)
    expect(result.current.loading).toBeFalsy()

    const doc = await myPouch.get('TOS')
    act(() => {
      myPouch.remove(doc._id, doc._rev)
    })

    await waitForLoadingChange(result, false)
    await waitForNextUpdate(result)

    expect(result.current.docs).toHaveLength(4)
    expect(result.current.loading).toBeFalsy()
  })

  test("shouldn't re-query if a document not in the result gets deleted", async () => {
    await createDocs()

    const docToDelete = await myPouch.put({ _id: 'AA', other: 42 })

    const { result } = renderHook(
      () =>
        useFind({
          selector: { _id: { $gte: 'DS9' } },
          sort: ['_id'],
        }),
      {
        pouchdb: myPouch,
      },
    )

    await waitForLoadingChange(result, false)

    expect(result.current.docs).toHaveLength(5)
    expect(result.current.loading).toBeFalsy()

    const current = result.current
    act(() => {
      myPouch.remove(docToDelete.id, docToDelete.rev)
    })

    await waitForLoadingChange(result, false)
    expect(result.current.docs).toHaveLength(5)
    expect(result.current).toBe(current)
  })

  test('should re-query when the selector changes', async () => {
    await createDocs()

    const { result, rerender } = renderHook(
      (id: string) =>
        useFind({
          selector: { _id: { $gte: id } },
          sort: ['_id'],
        }),
      {
        initialProps: 'DS9',
        pouchdb: myPouch,
      },
    )

    await waitForNextUpdate(result)

    expect(result.current.docs).toHaveLength(5)

    rerender('ENT')

    expect(result.current.loading).toBeTruthy()

    await waitForNextUpdate(result)

    expect(result.current.docs).toHaveLength(4)
  })

  test("shouldn't re-query when the selector changes, but not it's value", async () => {
    await createDocs()

    const { result, rerender } = renderHook(
      (selector: PouchDB.Find.Selector) =>
        useFind({
          selector,
          sort: ['_id'],
        }),
      {
        initialProps: { _id: { $gte: 'DS9' } },
        pouchdb: myPouch,
      },
    )

    await waitForNextUpdate(result)

    expect(result.current.docs).toHaveLength(5)

    const current = result.current
    rerender({ _id: { $gte: 'DS9' } })

    await waitForLoadingChange(result, false)
    expect(result.current.docs).toHaveLength(5)
    expect(result.current).toBe(current)
  })
})

describe('index', () => {
  test('should use a existing index', async () => {
    await createDocs()

    await myPouch.createIndex({
      index: {
        fields: ['captain'],
      },
    })

    const { result } = renderHook(
      () =>
        useFind({
          selector: {
            captain: { $gt: null },
          },
          sort: ['captain'],
        }),
      {
        pouchdb: myPouch,
      },
    )

    expect(result.current.loading).toBeTruthy()

    await waitForLoadingChange(result, false)

    expect(result.current.warning).toBeFalsy()
    expect(result.current.docs).toEqual([
      {
        _id: 'DS9',
        _rev: expect.anything(),
        name: 'Deep Space Nine',
        captain: 'Benjamin Sisko',
        aired: 1993,
      },
      {
        _id: 'TOS',
        _rev: expect.anything(),
        name: 'The Original Series',
        captain: 'James T. Kirk',
        aired: 1966,
      },
      {
        _id: 'TNG',
        _rev: expect.anything(),
        name: 'The Next Generation',
        captain: 'Jean-Luc Picard',
        aired: 1987,
      },
      {
        _id: 'ENT',
        _rev: expect.anything(),
        name: 'Enterprise',
        captain: 'Jonathan Archer',
        aired: 2001,
      },
      {
        _id: 'VOY',
        _rev: expect.anything(),
        name: 'Voyager',
        captain: 'Kathryn Janeway',
        aired: 1995,
      },
    ])
  })

  test('should create an index and use it', async () => {
    await createDocs()

    const { result } = renderHook(
      () =>
        useFind({
          index: {
            fields: ['captain'],
          },
          selector: {
            captain: { $gt: null },
          },
          sort: ['captain'],
        }),
      {
        pouchdb: myPouch,
      },
    )

    expect(result.current.loading).toBeTruthy()

    await waitForLoadingChange(result, false)

    expect(result.current.loading).toBeFalsy()
    expect(result.current.warning).toBeFalsy()
    expect(result.current.docs).toEqual([
      {
        _id: 'DS9',
        _rev: expect.anything(),
        name: 'Deep Space Nine',
        captain: 'Benjamin Sisko',
        aired: 1993,
      },
      {
        _id: 'TOS',
        _rev: expect.anything(),
        name: 'The Original Series',
        captain: 'James T. Kirk',
        aired: 1966,
      },
      {
        _id: 'TNG',
        _rev: expect.anything(),
        name: 'The Next Generation',
        captain: 'Jean-Luc Picard',
        aired: 1987,
      },
      {
        _id: 'ENT',
        _rev: expect.anything(),
        name: 'Enterprise',
        captain: 'Jonathan Archer',
        aired: 2001,
      },
      {
        _id: 'VOY',
        _rev: expect.anything(),
        name: 'Voyager',
        captain: 'Kathryn Janeway',
        aired: 1995,
      },
    ])
  })

  test('should warn if no index exist', async () => {
    await createDocs()

    const { result } = renderHook(
      () =>
        useFind({
          selector: {
            captain: { $gt: null },
          },
        }),
      {
        pouchdb: myPouch,
      },
    )

    expect(result.current.loading).toBeTruthy()

    await waitForLoadingChange(result, false)

    expect(typeof result.current.warning).toBe('string')
    expect(result.current.warning?.length).toBeGreaterThan(0)
    expect(result.current.docs).toHaveLength(5)
  })

  test("shouldn't warn if an index already exist", async () => {
    await createDocs()

    await myPouch.createIndex({
      index: {
        fields: ['captain'],
      },
    })

    const { result } = renderHook(
      () =>
        useFind({
          index: {
            fields: ['captain'],
          },
          selector: {
            captain: { $gt: null },
          },
        }),
      {
        pouchdb: myPouch,
      },
    )

    expect(result.current.loading).toBeTruthy()

    await waitForLoadingChange(result, false)

    expect(result.current.warning).toBeFalsy()
    expect(result.current.docs).toHaveLength(5)
  })

  test('should remove warn if an index gets created', async () => {
    await createDocs()

    const { result, rerender } = renderHook(
      (index?: FindHookIndexOption) =>
        useFind({
          index,
          selector: {
            captain: { $gt: null },
          },
        }),
      {
        initialProps: undefined,
        pouchdb: myPouch,
      },
    )

    expect(result.current.loading).toBeTruthy()

    await waitForLoadingChange(result, false)

    expect(result.current.warning).toBeTruthy()
    expect(result.current.docs).toHaveLength(5)

    rerender({
      fields: ['captain'],
    })

    await waitForLoadingChange(result, false)

    expect(result.current.warning).toBeUndefined()
    expect(result.current.docs).toHaveLength(5)
  })

  test('should create an index with the provided name and ddoc', async () => {
    await createDocs()

    const { result } = renderHook(
      () =>
        useFind({
          index: {
            fields: ['captain'],
            ddoc: 'star_trek',
            name: 'captains',
          },
          selector: {
            captain: { $gt: null },
          },
          sort: ['captain'],
        }),
      {
        pouchdb: myPouch,
      },
    )

    expect(result.current.loading).toBeTruthy()

    await waitForLoadingChange(result, false)

    expect(result.current.warning).toBeFalsy()
    expect(result.current.docs).toHaveLength(5)

    const ddoc = await myPouch.get<Record<string, unknown>>('_design/star_trek')
    expect(ddoc).toBeTruthy()
    expect(ddoc.language).toBe('query')
    expect(typeof ddoc.views).toBe('object')
    expect(typeof (ddoc.views as Record<string, unknown>).captains).toBe(
      'object',
    )
  })

  test('should create a new index if fields change', async () => {
    await createDocs()

    const { result, rerender } = renderHook(
      (fields: string[]) =>
        useFind({
          index: {
            fields,
          },
          selector: {
            [fields[0]]: { $gt: null },
          },
          sort: fields,
        }),
      {
        initialProps: ['captain'],
        pouchdb: myPouch,
      },
    )

    await waitForLoadingChange(result, false)
    expect(result.current.loading).toBeFalsy()

    rerender(['name'])

    expect(result.current.loading).toBeTruthy()

    await waitForLoadingChange(result, false)

    expect(result.current.loading).toBeFalsy()
    expect(result.current.docs).toEqual([
      {
        _id: 'DS9',
        _rev: expect.anything(),
        name: 'Deep Space Nine',
        captain: 'Benjamin Sisko',
        aired: 1993,
      },
      {
        _id: 'ENT',
        _rev: expect.anything(),
        name: 'Enterprise',
        captain: 'Jonathan Archer',
        aired: 2001,
      },
      {
        _id: 'TNG',
        _rev: expect.anything(),
        name: 'The Next Generation',
        captain: 'Jean-Luc Picard',
        aired: 1987,
      },
      {
        _id: 'TOS',
        _rev: expect.anything(),
        name: 'The Original Series',
        captain: 'James T. Kirk',
        aired: 1966,
      },
      {
        _id: 'VOY',
        _rev: expect.anything(),
        name: 'Voyager',
        captain: 'Kathryn Janeway',
        aired: 1995,
      },
    ])

    expect((await myPouch.getIndexes()).indexes).toHaveLength(3)
  })

  test('should create a new index if name or ddoc change', async () => {
    await createDocs()

    const { result, rerender } = renderHook(
      ({ name, ddoc }: { name: string; ddoc: string }) =>
        useFind({
          index: {
            fields: ['captain'],
            name,
            ddoc,
          },
          selector: {
            captain: { $gt: null },
          },
          sort: ['captain'],
        }),
      {
        initialProps: { ddoc: 'star_trek', name: 'captains' },
        pouchdb: myPouch,
      },
    )

    await waitForLoadingChange(result, false)

    expect(result.current.loading).toBeFalsy()

    rerender({ ddoc: 'star_trek', name: 'other' })

    expect(result.current.loading).toBeTruthy()

    await waitForLoadingChange(result, false)

    expect(result.current.loading).toBeFalsy()
    expect(result.current.docs).toHaveLength(5)

    rerender({ ddoc: 'star', name: 'other' })

    expect(result.current.loading).toBeTruthy()

    await waitForLoadingChange(result, false)

    expect(result.current.loading).toBeFalsy()
    expect(result.current.docs).toHaveLength(5)

    const starTrek =
      await myPouch.get<Record<string, Record<string, unknown>>>(
        '_design/star_trek',
      )
    expect(Object.keys(starTrek.views)).toEqual(['captains', 'other'])

    const starDDoc =
      await myPouch.get<Record<string, Record<string, unknown>>>('_design/star')
    expect(Object.keys(starDDoc.views)).toEqual(['other'])
  })

  test('should subscribe to changes', async () => {
    await createDocs()

    const { result } = renderHook(
      () =>
        useFind({
          index: {
            fields: ['captain'],
          },
          selector: {
            captain: { $gt: '' },
          },
          sort: ['captain'],
        }),
      {
        pouchdb: myPouch,
      },
    )

    await waitForLoadingChange(result, false)

    expect(result.current.error).toBeFalsy()
    expect(result.current.docs).toHaveLength(5)
    expect(result.current.loading).toBeFalsy()

    act(() => {
      myPouch.put({
        _id: 'aa',
        other: 'value',
      })
    })

    await sleep(20)
    expect(result.current.error).toBeFalsy()
    expect(result.current.loading).toBeFalsy()
    expect(result.current.docs).toHaveLength(5)

    act(() => {
      myPouch.put({
        _id: 'zzz',
        captain: 'Captain Hook',
      })
    })

    await waitForNextUpdate(result)

    await waitForLoadingChange(result, false)

    expect(result.current.loading).toBeFalsy()
    expect(result.current.error).toBeFalsy()
    expect(result.current.docs).toHaveLength(6)
  })

  test('should re-query if a change did happen while a query is underway', async () => {
    await createDocs()

    const { result } = renderHook(
      () =>
        useFind({
          index: {
            fields: ['captain'],
          },
          selector: {
            captain: { $gt: '' },
          },
          sort: ['captain'],
        }),
      {
        pouchdb: myPouch,
      },
    )

    await waitForLoadingChange(result, false)

    expect(result.current.docs).toHaveLength(5)
    expect(result.current.loading).toBeFalsy()

    act(() => {
      myPouch.put({
        _id: 'Jolly Roger',
        captain: 'Hook',
      })
    })

    act(() => {
      myPouch.put({ _id: 'test', captain: 'Ching Shih (石陽)' })
    })

    await waitForNextUpdate(result)

    expect(result.current.loading).toBeFalsy()
    expect(result.current.docs).toHaveLength(7)
  })

  test('should handle the deletion of docs in the result', async () => {
    await createDocs()

    const { result } = renderHook(
      () =>
        useFind({
          index: {
            fields: ['captain'],
          },
          selector: {
            captain: { $gt: '' },
          },
          sort: ['captain'],
        }),
      {
        pouchdb: myPouch,
      },
    )

    await waitForLoadingChange(result, false)

    expect(result.current.docs).toHaveLength(5)
    expect(result.current.loading).toBeFalsy()

    const doc = await myPouch.get('TOS')
    act(() => {
      myPouch.remove(doc._id, doc._rev)
    })

    await waitForNextUpdate(result)

    await waitForLoadingChange(result, false)
    expect(result.current.docs).toHaveLength(4)
    expect(result.current.loading).toBeFalsy()
  })

  test("shouldn't re-query if a document not in the result gets deleted", async () => {
    await createDocs()

    const docToDelete = await myPouch.post({ other: 42 })

    const { result } = renderHook(
      () =>
        useFind({
          index: {
            fields: ['captain'],
          },
          selector: {
            captain: { $gt: '' },
          },
          sort: ['captain'],
        }),
      {
        pouchdb: myPouch,
      },
    )

    await waitForLoadingChange(result, false)

    expect(result.current.docs).toHaveLength(5)
    expect(result.current.loading).toBeFalsy()

    const current = result.current
    act(() => {
      myPouch.remove(docToDelete.id, docToDelete.rev)
    })

    await waitForLoadingChange(result, false)
    expect(result.current.docs).toHaveLength(5)
    expect(result.current).toBe(current)
  })

  test('should re-query when the selector changes', async () => {
    await createDocs()

    const { result, rerender } = renderHook(
      (name: string | null) =>
        useFind({
          index: {
            fields: ['captain'],
          },
          selector: {
            captain: { $gt: name },
          },
          sort: ['captain'],
        }),
      {
        initialProps: null as null | string,
        pouchdb: myPouch,
      },
    )

    await waitForLoadingChange(result, false)

    expect(result.current.docs).toHaveLength(5)

    rerender('Jonathan Archer')

    expect(result.current.loading).toBeTruthy()

    await waitForLoadingChange(result, false)

    expect(result.current.docs).toHaveLength(1)
  })

  test("shouldn't re-query when the index changes, but not it's value", async () => {
    await createDocs()

    const { result, rerender } = renderHook(
      (options: PouchDB.Find.CreateIndexOptions) =>
        useFind({
          index: options.index,
          selector: {
            captain: { $gt: null },
          },
          sort: ['captain'],
        }),
      {
        initialProps: {
          index: {
            fields: ['captain'],
          },
        },
        pouchdb: myPouch,
      },
    )

    await waitForLoadingChange(result, false)

    expect(result.current.loading).toBeFalsy()
    expect(result.current.docs).toHaveLength(5)

    const current = result.current
    rerender({
      index: {
        fields: ['captain'],
      },
    })

    await waitForLoadingChange(result, false)
    expect(result.current.docs).toHaveLength(5)
    expect(result.current).toBe(current)
  })

  test("shouldn't re-query when the selector changes, but not it's value", async () => {
    await createDocs()

    const { result, rerender } = renderHook(
      (selector: PouchDB.Find.Selector) =>
        useFind({
          index: {
            fields: ['captain'],
          },
          selector,
          sort: ['captain'],
        }),
      {
        initialProps: {
          captain: { $gt: null },
        },
        pouchdb: myPouch,
      },
    )

    await waitForLoadingChange(result, false)

    expect(result.current.loading).toBeFalsy()
    expect(result.current.docs).toHaveLength(5)

    const current = result.current
    rerender({
      captain: { $gt: null },
    })

    await waitForLoadingChange(result, false)
    expect(result.current.docs).toHaveLength(5)
    expect(result.current).toBe(current)
  })

  describe('partial_filter_selector', () => {
    test('should use a existing index', async () => {
      await createDocs()
      const index = {
        fields: ['captain'],
        partial_filter_selector: {
          aired: { $gt: 1980 },
        },
      }

      await myPouch.createIndex({ index })

      const { result } = renderHook(
        () =>
          useFind({
            selector: {
              captain: { $gt: null },
            },
            index,
            sort: ['captain'],
          }),
        {
          pouchdb: myPouch,
        },
      )

      expect(result.current.loading).toBeTruthy()

      await waitForLoadingChange(result, false)

      expect(result.current.warning).toBeFalsy()
      expect(result.current.docs).toEqual([
        {
          _id: 'DS9',
          _rev: expect.anything(),
          name: 'Deep Space Nine',
          captain: 'Benjamin Sisko',
          aired: 1993,
        },
        {
          _id: 'TNG',
          _rev: expect.anything(),
          name: 'The Next Generation',
          captain: 'Jean-Luc Picard',
          aired: 1987,
        },
        {
          _id: 'ENT',
          _rev: expect.anything(),
          name: 'Enterprise',
          captain: 'Jonathan Archer',
          aired: 2001,
        },
        {
          _id: 'VOY',
          _rev: expect.anything(),
          name: 'Voyager',
          captain: 'Kathryn Janeway',
          aired: 1995,
        },
      ])
    })

    test('should create an index and use it', async () => {
      await createDocs()

      const { result } = renderHook(
        () =>
          useFind({
            index: {
              fields: ['captain'],
              partial_filter_selector: {
                aired: { $gt: 1980 },
              },
            },
            selector: {
              captain: { $gt: null },
            },
            sort: ['captain'],
          }),
        {
          pouchdb: myPouch,
        },
      )

      expect(result.current.loading).toBeTruthy()

      await waitForLoadingChange(result, false)

      expect(result.current.loading).toBeFalsy()
      expect(result.current.warning).toBeFalsy()
      expect(result.current.docs).toEqual([
        {
          _id: 'DS9',
          _rev: expect.anything(),
          name: 'Deep Space Nine',
          captain: 'Benjamin Sisko',
          aired: 1993,
        },
        {
          _id: 'TNG',
          _rev: expect.anything(),
          name: 'The Next Generation',
          captain: 'Jean-Luc Picard',
          aired: 1987,
        },
        {
          _id: 'ENT',
          _rev: expect.anything(),
          name: 'Enterprise',
          captain: 'Jonathan Archer',
          aired: 2001,
        },
        {
          _id: 'VOY',
          _rev: expect.anything(),
          name: 'Voyager',
          captain: 'Kathryn Janeway',
          aired: 1995,
        },
      ])
    })

    test('should subscribe to changes', async () => {
      await createDocs()

      const { result } = renderHook(
        () =>
          useFind({
            index: {
              fields: ['captain'],
              partial_filter_selector: {
                aired: { $gt: 1980 },
              },
            },
            selector: {
              captain: { $gt: '' },
            },
            sort: ['captain'],
          }),
        {
          pouchdb: myPouch,
        },
      )

      await waitForLoadingChange(result, false)

      expect(result.current.error).toBeFalsy()
      expect(result.current.docs).toHaveLength(4)
      expect(result.current.loading).toBeFalsy()

      await act(async () => {
        await myPouch.put({
          _id: 'aa',
          captain: 'Captain Hook',
        })
        await sleep(20)
      })

      await waitForLoadingChange(result, false)

      expect(result.current.error).toBeFalsy()
      expect(result.current.loading).toBeFalsy()
      expect(result.current.docs).toHaveLength(4)

      await act(async () => {
        await myPouch.put({
          _id: 'Sendung mit der Maus',
          captain: "Käpt'n Blaubär",
          aired: 1991,
        })
        await sleep(20)
      })

      await waitForLoadingChange(result, false)

      expect(result.current.loading).toBeFalsy()
      expect(result.current.error).toBeFalsy()
      expect(result.current.docs).toHaveLength(5)
    })
  })
})

describe('options', () => {
  test('should only return fields in fields', async () => {
    await createDocs()

    const { result, rerender } = renderHook(
      (fields: string[]) =>
        useFind({
          index: {
            fields: ['captain'],
          },
          selector: {
            captain: { $gt: null },
          },
          sort: ['captain'],
          fields,
        }),
      {
        initialProps: ['captain'],
        pouchdb: myPouch,
      },
    )

    await waitForLoadingChange(result, false)

    expect(result.current.docs).toEqual([
      { captain: 'Benjamin Sisko' },
      { captain: 'James T. Kirk' },
      { captain: 'Jean-Luc Picard' },
      { captain: 'Jonathan Archer' },
      { captain: 'Kathryn Janeway' },
    ])

    rerender(['_id', 'aired'])

    await waitForLoadingChange(result, false)

    expect(result.current.docs).toEqual([
      { _id: 'DS9', aired: 1993 },
      { _id: 'TOS', aired: 1966 },
      { _id: 'TNG', aired: 1987 },
      { _id: 'ENT', aired: 2001 },
      { _id: 'VOY', aired: 1995 },
    ])
  })

  test('should handle the deletion of result docs if _id in not in fields', async () => {
    await createDocs()

    const { result } = renderHook(
      () =>
        useFind({
          index: {
            fields: ['captain'],
          },
          selector: {
            captain: { $gt: null },
          },
          sort: ['captain'],
          fields: ['captain'],
        }),
      {
        pouchdb: myPouch,
      },
    )

    await waitForLoadingChange(result, false)

    expect(result.current.docs).toHaveLength(5)

    const doc = await myPouch.get('TOS')
    act(() => {
      myPouch.remove(doc._id, doc._rev)
    })

    await waitForLoadingChange(result, false)
    await waitForNextUpdate(result)

    expect(result.current.docs).toHaveLength(4)
  })

  test('should handle limit', async () => {
    await createDocs()

    const { result, rerender } = renderHook(
      (limit: number) =>
        useFind({
          index: {
            fields: ['captain'],
          },
          selector: {
            captain: { $gt: null },
          },
          sort: ['captain'],
          limit,
        }),
      {
        initialProps: 4,
        pouchdb: myPouch,
      },
    )

    await waitForLoadingChange(result, false)

    expect(result.current.docs).toHaveLength(4)
    expect(result.current.docs[3]).toEqual({
      _id: 'ENT',
      _rev: expect.anything(),
      aired: 2001,
      captain: 'Jonathan Archer',
      name: 'Enterprise',
    })

    rerender(2)

    await waitForLoadingChange(result, false)

    expect(result.current.docs).toHaveLength(2)
    expect(result.current.docs[1]._id).toBe('TOS')
  })

  test('should handle skip', async () => {
    await createDocs()

    const { result, rerender } = renderHook(
      (skip: number) =>
        useFind({
          index: {
            fields: ['captain'],
          },
          selector: {
            captain: { $gt: null },
          },
          sort: ['captain'],
          skip,
        }),
      {
        initialProps: 4,
        pouchdb: myPouch,
      },
    )

    await waitForLoadingChange(result, false)

    expect(result.current.docs).toHaveLength(1)
    expect(result.current.docs).toEqual([
      {
        _id: 'VOY',
        _rev: expect.anything(),
        aired: 1995,
        captain: 'Kathryn Janeway',
        name: 'Voyager',
      },
    ])

    rerender(2)

    await waitForLoadingChange(result, false)

    expect(result.current.docs).toHaveLength(3)
    expect(result.current.docs[0]).toEqual({
      _id: 'TNG',
      _rev: expect.anything(),
      aired: 1987,
      captain: 'Jean-Luc Picard',
      name: 'The Next Generation',
    })
  })

  test('should support the selection of a database in the context to be used', async () => {
    const other = new PouchDB('other', { adapter: 'memory' })

    await myPouch.put({
      _id: 'test',
      value: 'myPouch',
    })

    await other.put({
      _id: 'test',
      value: 'other',
    })

    const { result, rerender } = renderHookWithMultiDbContext(
      (name?: string) =>
        useFind({
          index: {
            fields: ['value'],
          },
          selector: {
            value: { $gt: null },
          },
          db: name,
        }),
      {
        initialProps: undefined,
        main: myPouch,
        other: other,
      },
    )

    await waitForLoadingChange(result, false)

    // No db selection
    expect(result.current.loading).toBeFalsy()
    expect(result.current.docs).toEqual([
      {
        _id: 'test',
        _rev: expect.anything(),
        value: 'myPouch',
      },
    ])

    // selecting a database that is not the default
    rerender('other')
    expect(result.current.loading).toBeTruthy()
    await waitForLoadingChange(result, false)

    expect(result.current.loading).toBeFalsy()
    expect(result.current.docs).toEqual([
      {
        _id: 'test',
        _rev: expect.anything(),
        value: 'other',
      },
    ])

    // selecting the default db by it's name
    rerender('main')
    expect(result.current.loading).toBeTruthy()
    await waitForLoadingChange(result, false)

    expect(result.current.loading).toBeFalsy()
    expect(result.current.docs).toEqual([
      {
        _id: 'test',
        _rev: expect.anything(),
        value: 'myPouch',
      },
    ])

    // reset to other db
    rerender('other')
    expect(result.current.loading).toBeTruthy()
    await waitForLoadingChange(result, false)

    // selecting by special _default key
    rerender('_default')
    await waitForLoadingChange(result, false)

    expect(result.current.docs).toEqual([
      {
        _id: 'test',
        _rev: expect.anything(),
        value: 'myPouch',
      },
    ])

    await other.destroy()
  })
})

describe('populate functionality', () => {
  interface TestPost {
    _id: string
    _rev: string
    type: 'post'
    title: string
    site_id: string
    author_id: string
    published: boolean
  }

  interface TestSite {
    _id: string
    _rev: string
    type: 'site'
    name: string
    domain: string
  }

  interface TestUser {
    _id: string
    _rev: string
    type: 'user'
    name: string
    email: string
  }

  beforeEach(async () => {
    // Create reference documents
    await myPouch.put({
      _id: 'site_1',
      type: 'site',
      name: 'Tech Blog',
      domain: 'techblog.com',
    } as TestSite)

    await myPouch.put({
      _id: 'site_2',
      type: 'site',
      name: 'News Site',
      domain: 'news.com',
    } as TestSite)

    await myPouch.put({
      _id: 'user_1',
      type: 'user',
      name: 'John Doe',
      email: 'john@example.com',
    } as TestUser)

    await myPouch.put({
      _id: 'user_2',
      type: 'user',
      name: 'Jane Smith',
      email: 'jane@example.com',
    } as TestUser)

    // Create test posts
    await myPouch.put({
      _id: 'post_1',
      type: 'post',
      title: 'First Post',
      site_id: 'site_1',
      author_id: 'user_1',
      published: true,
    } as TestPost)

    await myPouch.put({
      _id: 'post_2',
      type: 'post',
      title: 'Second Post',
      site_id: 'site_2',
      author_id: 'user_2',
      published: true,
    } as TestPost)

    await myPouch.put({
      _id: 'post_3',
      type: 'post',
      title: 'Draft Post',
      site_id: 'site_1',
      author_id: 'user_1',
      published: false,
    } as TestPost)
  })

  test('should populate documents in find results', async () => {
    const populateConfig: PopulateConfig = {
      site_id: { as: 'site' },
      author_id: { as: 'author' },
    }

    const { result } = renderHook(
      () =>
        useFind<TestPost>({
          selector: { type: 'post', published: true },
          sort: ['_id'],
          populate: populateConfig,
        }),
      { pouchdb: myPouch },
    )

    await waitForNextUpdate(result)

    expect(result.current.loading).toBe(false)
    expect(result.current.docs).toHaveLength(2)

    // Check first post
    const firstDoc = result.current.docs[0] as TestPost & {
      site: TestSite
      author: TestUser
    }
    expect(firstDoc._id).toBe('post_1')
    expect(firstDoc.site).toBeDefined()
    expect(firstDoc.site.name).toBe('Tech Blog')
    expect(firstDoc.author).toBeDefined()
    expect(firstDoc.author.name).toBe('John Doe')

    // Check second post
    const secondDoc = result.current.docs[1] as TestPost & {
      site: TestSite
      author: TestUser
    }
    expect(secondDoc._id).toBe('post_2')
    expect(secondDoc.site).toBeDefined()
    expect(secondDoc.site.name).toBe('News Site')
    expect(secondDoc.author).toBeDefined()
    expect(secondDoc.author.name).toBe('Jane Smith')
  })

  test('should work without populate config', async () => {
    const { result } = renderHook(
      () =>
        useFind<TestPost>({
          selector: { type: 'post', published: true },
          sort: ['_id'],
        }),
      { pouchdb: myPouch },
    )

    await waitForNextUpdate(result)

    expect(result.current.loading).toBe(false)
    expect(result.current.docs).toHaveLength(2)

    // Check that documents are not populated
    const firstDoc = result.current.docs[0] as TestPost
    expect(firstDoc._id).toBe('post_1')
    expect(firstDoc.site).toBeUndefined()
    expect(firstDoc.author).toBeUndefined()
  })

  test('should handle missing references gracefully', async () => {
    // Create a post with a missing reference
    await myPouch.put({
      _id: 'post_4',
      type: 'post',
      title: 'Post with missing ref',
      site_id: 'nonexistent_site',
      author_id: 'user_1',
      published: true,
    } as TestPost)

    const populateConfig: PopulateConfig = {
      site_id: { as: 'site' },
      author_id: { as: 'author' },
    }

    const { result } = renderHook(
      () =>
        useFind<TestPost>({
          selector: { _id: 'post_4' },
          populate: populateConfig,
        }),
      { pouchdb: myPouch },
    )

    await waitForNextUpdate(result)

    expect(result.current.loading).toBe(false)
    expect(result.current.docs).toHaveLength(1)

    const doc = result.current.docs[0] as TestPost & {
      site?: TestSite
      author: TestUser
    }
    expect(doc._id).toBe('post_4')

    // Missing reference should not be populated
    expect(doc.site).toBeUndefined()

    // Valid reference should be populated
    expect(doc.author).toBeDefined()
    expect(doc.author.name).toBe('John Doe')
  })

  test('should populate with specific fields selection', async () => {
    const populateConfig: PopulateConfig = {
      site_id: { as: 'site' },
    }

    const { result } = renderHook(
      () =>
        useFind<TestPost>({
          selector: { type: 'post', published: true },
          fields: ['_id', 'title', 'site_id'],
          sort: ['_id'],
          populate: populateConfig,
        }),
      { pouchdb: myPouch },
    )

    await waitForNextUpdate(result)

    expect(result.current.loading).toBe(false)
    expect(result.current.docs).toHaveLength(2)

    const firstDoc = result.current.docs[0] as TestPost & { site: TestSite }
    expect(firstDoc._id).toBe('post_1')
    expect(firstDoc.title).toBe('First Post')
    expect(firstDoc.site).toBeDefined()
    expect(firstDoc.site.name).toBe('Tech Blog')

    // Fields not requested should not be present
    expect(firstDoc.author_id).toBeUndefined()
    expect(firstDoc.published).toBeUndefined()
  })

  test('should update populated data when documents change', async () => {
    const populateConfig: PopulateConfig = {
      site_id: { as: 'site' },
    }

    const { result } = renderHook(
      () =>
        useFind<TestPost>({
          selector: { _id: 'post_1' },
          populate: populateConfig,
        }),
      { pouchdb: myPouch },
    )

    await waitForNextUpdate(result)

    expect(result.current.loading).toBe(false)
    const firstDoc = result.current.docs[0] as TestPost & { site: TestSite }
    expect(firstDoc.site.name).toBe('Tech Blog')

    // Update the post to reference a different site
    const currentPost = await myPouch.get<TestPost>('post_1')
    act(() => {
      myPouch.put({
        ...currentPost,
        site_id: 'site_2',
      })
    })

    await waitForNextUpdate(result)

    expect(result.current.loading).toBe(false)
    const updatedDoc = result.current.docs[0] as TestPost & { site: TestSite }
    expect(updatedDoc.site.name).toBe('News Site')
  })

  test('should work with complex selectors', async () => {
    const populateConfig: PopulateConfig = {
      site_id: { as: 'site' },
      author_id: { as: 'author' },
    }

    const { result } = renderHook(
      () =>
        useFind<TestPost>({
          selector: {
            type: 'post',
            $or: [{ site_id: 'site_1' }, { author_id: 'user_2' }],
          },
          sort: ['_id'],
          populate: populateConfig,
        }),
      { pouchdb: myPouch },
    )

    await waitForNextUpdate(result)

    expect(result.current.loading).toBe(false)
    expect(result.current.docs.length).toBeGreaterThan(0)

    // All returned documents should be populated
    result.current.docs.forEach(doc => {
      const populatedDoc = doc as TestPost & {
        site: TestSite
        author: TestUser
      }
      expect(populatedDoc.site).toBeDefined()
      expect(populatedDoc.author).toBeDefined()
    })
  })

  test('should populate any referenced document regardless of type', async () => {
    // Create a document with different type but valid structure
    await myPouch.put({
      _id: 'site_different_type',
      type: 'category',
      name: 'Category Site',
      domain: 'category.com',
    })

    // Create post referencing this document
    await myPouch.put({
      _id: 'post_5',
      type: 'post',
      title: 'Fifth Post',
      site_id: 'site_different_type',
      author_id: 'user_1',
      published: true,
    } as TestPost)

    const populateConfig: PopulateConfig = {
      site_id: { as: 'site' },
      author_id: { as: 'author' },
    }

    const { result } = renderHook(
      () =>
        useFind<TestPost>({
          selector: { _id: 'post_5' },
          populate: populateConfig,
        }),
      { pouchdb: myPouch },
    )

    await waitForNextUpdate(result)

    expect(result.current.loading).toBe(false)
    const doc = result.current.docs[0] as TestPost & {
      site: unknown
      author: TestUser
    }

    // Any document should be populated (no type filtering)
    expect(doc.site).toBeDefined()
    expect(doc.site.name).toBe('Category Site')
    expect(doc.site.type).toBe('category')

    // Author should still be populated
    expect(doc.author).toBeDefined()
    expect(doc.author.name).toBe('John Doe')
  })

  test('should work with limit and skip', async () => {
    const populateConfig: PopulateConfig = {
      site_id: { as: 'site' },
    }

    const { result } = renderHook(
      () =>
        useFind<TestPost>({
          selector: { type: 'post' },
          sort: ['_id'],
          limit: 2,
          skip: 1,
          populate: populateConfig,
        }),
      { pouchdb: myPouch },
    )

    await waitForNextUpdate(result)

    expect(result.current.loading).toBe(false)
    expect(result.current.docs).toHaveLength(2)

    // All returned documents should be populated
    result.current.docs.forEach(doc => {
      const populatedDoc = doc as TestPost & { site: TestSite }
      expect(populatedDoc.site).toBeDefined()
    })
  })
})

describe('enabled option', () => {
  test('should not execute query when enabled is false on mount', async () => {
    await createDocs()

    const { result } = renderHook(
      () =>
        useFind({
          selector: { _id: { $gte: 'DS9' } },
          sort: ['_id'],
          enabled: false,
        }),
      {
        pouchdb: myPouch,
      },
    )

    // Should not be loading
    expect(result.current.loading).toBeFalsy()
    expect(result.current.state).toBe('done')
    // Should return empty docs
    expect(result.current.docs).toEqual([])
    expect(result.current.error).toBeNull()

    // Wait a bit to ensure no query happens
    await sleep(50)

    // Still no docs
    expect(result.current.docs).toEqual([])
    expect(result.current.loading).toBeFalsy()
  })

  test('should execute query normally when enabled is true (default)', async () => {
    await createDocs()

    const { result } = renderHook(
      () =>
        useFind({
          selector: { _id: { $gte: 'DS9' } },
          sort: ['_id'],
          enabled: true,
        }),
      {
        pouchdb: myPouch,
      },
    )

    expect(result.current.loading).toBeTruthy()

    await waitForLoadingChange(result, false)

    expect(result.current.docs).toHaveLength(5)
    expect(result.current.loading).toBeFalsy()
  })

  test('should execute query when enabled is undefined (defaults to true)', async () => {
    await createDocs()

    const { result } = renderHook(
      () =>
        useFind({
          selector: { _id: { $gte: 'DS9' } },
          sort: ['_id'],
          // enabled not specified, should default to true
        }),
      {
        pouchdb: myPouch,
      },
    )

    expect(result.current.loading).toBeTruthy()

    await waitForLoadingChange(result, false)

    expect(result.current.docs).toHaveLength(5)
    expect(result.current.loading).toBeFalsy()
  })

  test('should start querying when toggling from false to true', async () => {
    await createDocs()

    const { result, rerender } = renderHook(
      (enabled: boolean) =>
        useFind({
          selector: { _id: { $gte: 'DS9' } },
          sort: ['_id'],
          enabled,
        }),
      {
        initialProps: false,
        pouchdb: myPouch,
      },
    )

    // Initially disabled
    expect(result.current.loading).toBeFalsy()
    expect(result.current.docs).toEqual([])

    // Enable the query
    rerender(true)

    expect(result.current.loading).toBeTruthy()

    await waitForLoadingChange(result, false)

    expect(result.current.docs).toHaveLength(5)
    expect(result.current.loading).toBeFalsy()
  })

  test('should preserve data when toggling from true to false', async () => {
    await createDocs()

    const { result, rerender } = renderHook(
      (enabled: boolean) =>
        useFind({
          selector: { _id: { $gte: 'DS9' } },
          sort: ['_id'],
          enabled,
        }),
      {
        initialProps: true,
        pouchdb: myPouch,
      },
    )

    await waitForLoadingChange(result, false)

    expect(result.current.docs).toHaveLength(5)
    const docsWhenEnabled = result.current.docs

    // Disable the query
    rerender(false)

    // Should preserve the previous data
    expect(result.current.loading).toBeFalsy()
    expect(result.current.docs).toEqual(docsWhenEnabled)
  })

  test('should handle false -> true -> false transition', async () => {
    await createDocs()

    const { result, rerender } = renderHook(
      (enabled: boolean) =>
        useFind({
          selector: { _id: { $gte: 'DS9' } },
          sort: ['_id'],
          enabled,
        }),
      {
        initialProps: false,
        pouchdb: myPouch,
      },
    )

    // 1. Initially disabled
    expect(result.current.docs).toEqual([])

    // 2. Enable
    rerender(true)
    await waitForLoadingChange(result, false)
    expect(result.current.docs).toHaveLength(5)
    const docsWhenEnabled = result.current.docs

    // 3. Disable again
    rerender(false)
    expect(result.current.loading).toBeFalsy()
    // Should keep the data from when it was enabled
    expect(result.current.docs).toEqual(docsWhenEnabled)
  })

  test('should handle multiple rapid toggles', async () => {
    await createDocs()

    const { result, rerender } = renderHook(
      (enabled: boolean) =>
        useFind({
          selector: { _id: { $gte: 'DS9' } },
          sort: ['_id'],
          enabled,
        }),
      {
        initialProps: false,
        pouchdb: myPouch,
      },
    )

    // false -> true
    rerender(true)
    await waitForLoadingChange(result, false)
    expect(result.current.docs).toHaveLength(5)

    // true -> false
    rerender(false)
    expect(result.current.loading).toBeFalsy()

    // false -> true
    rerender(true)
    await waitForLoadingChange(result, false)
    expect(result.current.docs).toHaveLength(5)

    // true -> false
    rerender(false)
    expect(result.current.loading).toBeFalsy()
    expect(result.current.docs).toHaveLength(5)
  })

  test('should not cause infinite re-renders', async () => {
    await createDocs()

    let renderCount = 0

    const { result, rerender } = renderHook(
      (enabled: boolean) => {
        renderCount++
        return useFind({
          selector: { _id: { $gte: 'DS9' } },
          sort: ['_id'],
          enabled,
        })
      },
      {
        initialProps: false,
        pouchdb: myPouch,
      },
    )

    // Reset counter after initial render
    renderCount = 0

    // Toggle to enabled
    rerender(true)
    await waitForLoadingChange(result, false)

    // With React 19's StrictMode, we expect at most a few renders
    // (initial + loading state + done state + potential strict mode double render)
    // If there's an infinite loop, this would be >> 50
    expect(renderCount).toBeLessThan(50)

    // Reset counter
    renderCount = 0

    // Toggle to disabled
    rerender(false)
    await sleep(50)

    // Should not cause many re-renders
    expect(renderCount).toBeLessThan(10)
  })

  test('should not subscribe to changes when disabled', async () => {
    await createDocs()

    const { result, rerender } = renderHook(
      (enabled: boolean) =>
        useFind({
          selector: { _id: { $gte: 'DS9' } },
          sort: ['_id'],
          enabled,
        }),
      {
        initialProps: false,
        pouchdb: myPouch,
      },
    )

    // Disabled initially
    expect(result.current.docs).toEqual([])

    // Add a document while disabled
    await act(async () => {
      await myPouch.put({
        _id: 'zzz',
        name: 'Test',
      })
      await sleep(50)
    })

    // Should not have reacted to the change
    expect(result.current.docs).toEqual([])

    // Now enable
    rerender(true)
    await waitForLoadingChange(result, false)

    // Should now include the new document
    expect(result.current.docs).toHaveLength(6)
  })

  test('should re-subscribe when re-enabled', async () => {
    await createDocs()

    const { result, rerender } = renderHook(
      (enabled: boolean) =>
        useFind({
          selector: { _id: { $gte: 'DS9' } },
          sort: ['_id'],
          enabled,
        }),
      {
        initialProps: true,
        pouchdb: myPouch,
      },
    )

    await waitForLoadingChange(result, false)
    expect(result.current.docs).toHaveLength(5)

    // Disable
    rerender(false)

    // Re-enable
    rerender(true)
    await waitForLoadingChange(result, false)

    // Should now be subscribed to changes
    await act(async () => {
      await myPouch.put({
        _id: 'zzz',
        captain: 'Hook',
      })
    })

    await waitForNextUpdate(result)

    expect(result.current.docs).toHaveLength(6)
  })

  test('loading state should not get stuck when toggling', async () => {
    await createDocs()

    const { result, rerender } = renderHook(
      (enabled: boolean) =>
        useFind({
          selector: { _id: { $gte: 'DS9' } },
          sort: ['_id'],
          enabled,
        }),
      {
        initialProps: true,
        pouchdb: myPouch,
      },
    )

    // Wait for initial load
    await waitForLoadingChange(result, false)
    expect(result.current.loading).toBeFalsy()

    // Disable
    rerender(false)
    expect(result.current.loading).toBeFalsy()

    // Re-enable
    rerender(true)
    expect(result.current.loading).toBeTruthy()
    await waitForLoadingChange(result, false)
    expect(result.current.loading).toBeFalsy()

    // Disable again
    rerender(false)
    expect(result.current.loading).toBeFalsy()
  })

  test('should work with enabled and selector changes', async () => {
    await createDocs()

    const { result, rerender } = renderHook(
      ({ enabled, minId }: { enabled: boolean; minId: string }) =>
        useFind({
          selector: { _id: { $gte: minId } },
          sort: ['_id'],
          enabled,
        }),
      {
        initialProps: { enabled: false, minId: 'DS9' },
        pouchdb: myPouch,
      },
    )

    // Initially disabled
    expect(result.current.docs).toEqual([])

    // Enable with same selector
    rerender({ enabled: true, minId: 'DS9' })
    await waitForLoadingChange(result, false)
    expect(result.current.docs).toHaveLength(5)

    // Change selector while enabled
    rerender({ enabled: true, minId: 'TNG' })
    await waitForLoadingChange(result, false)
    expect(result.current.docs).toHaveLength(3)

    // Disable
    rerender({ enabled: false, minId: 'TNG' })
    expect(result.current.loading).toBeFalsy()
    expect(result.current.docs).toHaveLength(3)
  })

  test('should work with enabled and index options', async () => {
    await createDocs()

    await myPouch.createIndex({
      index: {
        fields: ['captain'],
      },
    })

    const { result, rerender } = renderHook(
      (enabled: boolean) =>
        useFind({
          index: {
            fields: ['captain'],
          },
          selector: {
            captain: { $gt: null },
          },
          sort: ['captain'],
          enabled,
        }),
      {
        initialProps: false,
        pouchdb: myPouch,
      },
    )

    // Initially disabled
    expect(result.current.docs).toEqual([])

    // Enable
    rerender(true)
    await waitForLoadingChange(result, false)
    expect(result.current.docs).toHaveLength(5)
    expect(result.current.warning).toBeFalsy()

    // Disable
    rerender(false)
    expect(result.current.docs).toHaveLength(5)
  })

  test('should work with enabled and populate', async () => {
    // Setup test data
    await myPouch.put({
      _id: 'site_1',
      type: 'site',
      name: 'Tech Blog',
    })

    await myPouch.put({
      _id: 'post_1',
      type: 'post',
      title: 'First Post',
      site_id: 'site_1',
    })

    const { result, rerender } = renderHook(
      (enabled: boolean) =>
        useFind({
          selector: { type: 'post' },
          populate: {
            site_id: { as: 'site' },
          },
          enabled,
        }),
      {
        initialProps: false,
        pouchdb: myPouch,
      },
    )

    // Initially disabled
    expect(result.current.docs).toEqual([])

    // Enable
    rerender(true)
    await waitForNextUpdate(result)

    expect(result.current.docs).toHaveLength(1)
    const doc = result.current.docs[0] as { site?: { name: string } }
    expect(doc.site).toBeDefined()
    expect(doc.site?.name).toBe('Tech Blog')

    // Disable
    rerender(false)
    expect(result.current.docs).toHaveLength(1)
  })
})
