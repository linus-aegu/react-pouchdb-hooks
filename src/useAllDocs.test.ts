import PouchDB from 'pouchdb-core'
import memory from 'pouchdb-adapter-memory'
import mapReduce from 'pouchdb-mapreduce'

import {
  renderHook,
  renderHookWithMultiDbContext,
  act,
  waitForNextUpdate,
  DocWithAttachment,
  sleep,
} from './test-utils'
import useAllDocs from './useAllDocs'
import type { PopulateConfig } from './populate-types'

PouchDB.plugin(memory)
PouchDB.plugin(mapReduce)

let myPouch: PouchDB.Database

beforeEach(() => {
  myPouch = new PouchDB('test', { adapter: 'memory' })
})

afterEach(async () => {
  await myPouch.destroy()
})

test('should load all documents', async () => {
  const putResult = await myPouch.bulkDocs([
    { _id: 'a', test: 'value' },
    { _id: 'b', test: 'other' },
  ])

  const { result } = renderHook(() => useAllDocs(), {
    pouchdb: myPouch,
  })

  expect(result.current).toEqual({
    error: null,
    loading: true,
    state: 'loading',
    offset: 0,
    rows: [],
    total_rows: 0,
  })

  await waitForNextUpdate(result)

  expect(result.current).toEqual({
    error: null,
    loading: false,
    state: 'done',
    offset: 0,
    rows: [
      { id: 'a', key: 'a', value: { rev: putResult[0].rev } },
      { id: 'b', key: 'b', value: { rev: putResult[1].rev } },
    ],
    total_rows: 2,
  })
})

test('should subscribe to changes', async () => {
  const [{ rev: revA }, { rev: revB }] = await myPouch.bulkDocs([
    { _id: 'a', test: 'value' },
    { _id: 'b', test: 'other' },
  ])

  const { result } = renderHook(() => useAllDocs(), {
    pouchdb: myPouch,
  })

  expect(result.current.state).toBe('loading')

  await waitForNextUpdate(result)

  expect(result.current.state).toBe('done')
  expect(result.current.rows).toEqual([
    { id: 'a', key: 'a', value: { rev: revA } },
    { id: 'b', key: 'b', value: { rev: revB } },
  ])
  expect(result.current.total_rows).toBe(2)

  let revC = 'fail'
  let revD = 'fail'
  act(() => {
    myPouch
      .bulkDocs([
        { _id: 'c', test: 'Hallo!' },
        { _id: 'd', test: 'world!' },
      ])
      .then(result => {
        revC = result[0].rev ?? 'fail'
        revD = result[1].rev ?? 'fail'
      })
  })

  await waitForNextUpdate(result)

  expect(result.current.rows).toEqual([
    { id: 'a', key: 'a', value: { rev: revA } },
    { id: 'b', key: 'b', value: { rev: revB } },
    { id: 'c', key: 'c', value: { rev: revC } },
    { id: 'd', key: 'd', value: { rev: revD } },
  ])
  expect(result.current.total_rows).toBe(4)

  let secondUpdateRev = ''
  act(() => {
    myPouch
      .put({
        _id: 'a',
        _rev: revA,
        test: 'newValue',
      })
      .then(result => {
        secondUpdateRev = result.rev
      })
  })

  await waitForNextUpdate(result)

  expect(result.current.state).toBe('done')
  expect(result.current.rows).toEqual([
    { id: 'a', key: 'a', value: { rev: secondUpdateRev } },
    { id: 'b', key: 'b', value: { rev: revB } },
    { id: 'c', key: 'c', value: { rev: revC } },
    { id: 'd', key: 'd', value: { rev: revD } },
  ])
  expect(result.current.total_rows).toBe(4)

  act(() => {
    myPouch.remove('b', revB ?? 'fail')
  })

  await waitForNextUpdate(result)

  expect(result.current.state).toBe('done')
  expect(result.current.rows).toEqual([
    { id: 'a', key: 'a', value: { rev: secondUpdateRev } },
    { id: 'c', key: 'c', value: { rev: revC } },
    { id: 'd', key: 'd', value: { rev: revD } },
  ])
  expect(result.current.total_rows).toBe(3)
})

test('should reload if a change did happen while a query is running', async () => {
  const [{ rev: revA }, { rev: revB }] = await myPouch.bulkDocs([
    { _id: 'a', test: 'value' },
    { _id: 'b', test: 'other' },
  ])

  const { result } = renderHook(() => useAllDocs(), {
    pouchdb: myPouch,
  })

  await waitForNextUpdate(result)

  expect(result.current.state).toBe('done')
  expect(result.current.rows).toEqual([
    { id: 'a', key: 'a', value: { rev: revA } },
    { id: 'b', key: 'b', value: { rev: revB } },
  ])

  let revC = 'fail'
  let revD = 'fail'
  act(() => {
    myPouch
      .bulkDocs([
        { _id: 'c', test: 'Hallo!' },
        { _id: 'd', test: 'world!' },
      ])
      .then(result => {
        revC = result[0].rev ?? 'fail'
        revD = result[1].rev ?? 'fail'
      })
  })

  expect(result.current.rows).toEqual([
    { id: 'a', key: 'a', value: { rev: revA } },
    { id: 'b', key: 'b', value: { rev: revB } },
  ])

  let revE = 'fail'
  act(() => {
    myPouch.put({ _id: 'e', test: 'Hallo!' }).then(result => {
      revE = result.rev
    })
  })

  await waitForNextUpdate(result)

  expect(result.current.state).toBe('done')
  expect(result.current.rows).toEqual([
    { id: 'a', key: 'a', value: { rev: revA } },
    { id: 'b', key: 'b', value: { rev: revB } },
    { id: 'c', key: 'c', value: { rev: revC } },
    { id: 'd', key: 'd', value: { rev: revD } },
    { id: 'e', key: 'e', value: { rev: revE } },
  ])
})

describe('options', () => {
  test('should handle the include_docs option', async () => {
    const [{ rev: revA }, { rev: revB }] = await myPouch.bulkDocs([
      { _id: 'a', test: 'value' },
      { _id: 'b', test: 'other' },
    ])

    const { result, rerender } = renderHook(
      (include_docs: boolean) => useAllDocs({ include_docs }),
      {
        initialProps: false,
        pouchdb: myPouch,
      }
    )

    await waitForNextUpdate(result)

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'a', key: 'a', value: { rev: revA } },
      { id: 'b', key: 'b', value: { rev: revB } },
    ])

    rerender(true)

    await waitForNextUpdate(result)

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      {
        id: 'a',
        key: 'a',
        value: { rev: revA },
        doc: { _id: 'a', _rev: revA, test: 'value' },
      },
      {
        id: 'b',
        key: 'b',
        value: { rev: revB },
        doc: { _id: 'b', _rev: revB, test: 'other' },
      },
    ])
  })

  test('should handle the conflicts option', async () => {
    const [{ rev: revA }] = await myPouch.bulkDocs([
      { _id: 'a', test: 'value' },
      { _id: 'b', test: 'other' },
    ])

    const updateResult = await myPouch.put({
      _id: 'a',
      _rev: revA,
      test: 'update',
      type: 'tester',
    })

    const conflictResult = await myPouch.put(
      {
        _id: 'a',
        _rev: revA,
        test: 'conflict',
        type: 'tester',
      },
      { force: true }
    )

    const { result, rerender } = renderHook(
      (conflicts: boolean) => useAllDocs({ include_docs: true, conflicts }),
      {
        initialProps: false,
        pouchdb: myPouch,
      }
    )

    await waitForNextUpdate(result)

    expect(result.current.state).toBe('done')
    expect(result.current.rows[0].doc?._conflicts).toBeUndefined()

    rerender(true)

    await waitForNextUpdate(result)

    expect(result.current.state).toBe('done')
    expect(result.current.rows[0].doc?._conflicts).toEqual(
      result.current.rows[0].doc?._rev === updateResult.rev
        ? [conflictResult.rev]
        : [updateResult.rev]
    )
    expect(result.current.rows[1].doc?._conflicts).toBeUndefined()
  })

  test('should handle the attachments option', async () => {
    await myPouch.bulkDocs([
      {
        _attachments: {
          'info.txt': {
            content_type: 'text/plain',
            data: Buffer.from('Is there life on Mars?\n'),
          },
        },
        _id: 'a',
        test: 'value',
      },
      { _id: 'b', test: 'other' },
    ])

    const { result, rerender } = renderHook(
      (attachments: boolean) => useAllDocs({ include_docs: true, attachments }),
      {
        initialProps: false,
        pouchdb: myPouch,
      }
    )

    await waitForNextUpdate(result)

    expect(result.current.state).toBe('done')
    expect(
      (result.current.rows[0].doc as DocWithAttachment)._attachments['info.txt']
    ).toEqual({
      content_type: 'text/plain',
      digest: 'md5-knhR9rrbyHqrdPJYmv/iAg==',
      length: 23,
      revpos: 1,
      stub: true,
    })

    rerender(true)

    await waitForNextUpdate(result)

    expect(result.current.state).toBe('done')
    expect(
      (result.current.rows[0].doc as DocWithAttachment)._attachments['info.txt']
    ).toEqual({
      content_type: 'text/plain',
      data: 'SXMgdGhlcmUgbGlmZSBvbiBNYXJzPwo=',
      digest: 'md5-knhR9rrbyHqrdPJYmv/iAg==',
      revpos: 1,
    })
  })

  test('should handle the binary option', async () => {
    await myPouch.bulkDocs([
      {
        _attachments: {
          'info.txt': {
            content_type: 'text/plain',
            data: Buffer.from('Is there life on Mars?\n'),
          },
        },
        _id: 'a',
        test: 'value',
        type: 'tester',
      },
      { _id: 'b', test: 'other', type: 'checker' },
    ])

    const { result, rerender } = renderHook(
      (binary: boolean) =>
        useAllDocs({
          include_docs: true,
          attachments: true,
          binary,
        }),
      {
        initialProps: false,
        pouchdb: myPouch,
      }
    )

    await waitForNextUpdate(result)

    expect(result.current.state).toBe('done')
    expect(
      (result.current.rows[0].doc as DocWithAttachment)._attachments['info.txt']
    ).toEqual({
      content_type: 'text/plain',
      data: 'SXMgdGhlcmUgbGlmZSBvbiBNYXJzPwo=',
      digest: 'md5-knhR9rrbyHqrdPJYmv/iAg==',
      revpos: 1,
    })

    rerender(true)

    await waitForNextUpdate(result)

    expect(result.current.state).toBe('done')
    expect(
      (result.current.rows[0].doc as DocWithAttachment)._attachments['info.txt']
    ).toEqual({
      content_type: 'text/plain',
      data: Buffer.from('Is there life on Mars?\n'),
      digest: 'md5-knhR9rrbyHqrdPJYmv/iAg==',
      revpos: 1,
    })
  })

  test('should handle the startkey option', async () => {
    const [{ rev: revA }, { rev: revB }] = await myPouch.bulkDocs([
      { _id: 'a', test: 'value' },
      { _id: 'b', test: 'other' },
    ])

    const { result, rerender } = renderHook(
      (startkey: string) => useAllDocs({ startkey, endkey: 'x' }),
      {
        initialProps: 'b',
        pouchdb: myPouch,
      }
    )

    await waitForNextUpdate(result)

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'b', key: 'b', value: { rev: revB } },
    ])

    let revAA = 'fail'
    act(() => {
      myPouch.put({ _id: 'aa' }).then(result => {
        revAA = result.rev
      })
    })

    await sleep(10)

    expect(result.current.rows).toEqual([
      { id: 'b', key: 'b', value: { rev: revB } },
    ])

    rerender('a')

    await waitForNextUpdate(result)

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'a', key: 'a', value: { rev: revA } },
      { id: 'aa', key: 'aa', value: { rev: revAA } },
      { id: 'b', key: 'b', value: { rev: revB } },
    ])
  })

  test('should handle the endkey option', async () => {
    const [{ rev: revA }, { rev: revB }] = await myPouch.bulkDocs([
      { _id: 'a', test: 'value' },
      { _id: 'b', test: 'other' },
    ])

    const { result, rerender } = renderHook(
      (endkey: string) => useAllDocs({ startkey: 'a', endkey }),
      {
        initialProps: 'x',
        pouchdb: myPouch,
      }
    )

    await waitForNextUpdate(result)

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'a', key: 'a', value: { rev: revA } },
      { id: 'b', key: 'b', value: { rev: revB } },
    ])

    rerender('a')

    await waitForNextUpdate(result)

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'a', key: 'a', value: { rev: revA } },
    ])

    act(() => {
      myPouch.put({ _id: 'c', test: 'moar' })
    })

    await sleep(10)

    expect(result.current.rows).toEqual([
      { id: 'a', key: 'a', value: { rev: revA } },
    ])
  })

  test('should handle the inclusive_end option', async () => {
    const [{ rev: revA }, { rev: revB }] = await myPouch.bulkDocs([
      { _id: 'a', test: 'value' },
      { _id: 'b', test: 'other' },
    ])

    const { result, rerender } = renderHook(
      (inclusive_end: boolean) =>
        useAllDocs({ startkey: 'a', endkey: 'b', inclusive_end }),
      {
        initialProps: true,
        pouchdb: myPouch,
      }
    )

    await waitForNextUpdate(result)

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'a', key: 'a', value: { rev: revA } },
      { id: 'b', key: 'b', value: { rev: revB } },
    ])

    act(() => {
      myPouch.put({ _id: 'c', test: 'moar' })
    })

    await sleep(10)

    expect(result.current.rows).toEqual([
      { id: 'a', key: 'a', value: { rev: revA } },
      { id: 'b', key: 'b', value: { rev: revB } },
    ])

    rerender(false)

    await waitForNextUpdate(result)

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'a', key: 'a', value: { rev: revA } },
    ])
  })

  test('should handle the limit option', async () => {
    const [{ rev: revA }, { rev: revB }] = await myPouch.bulkDocs([
      { _id: 'a', test: 'value' },
      { _id: 'b', test: 'other' },
    ])

    const { result, rerender } = renderHook(
      (limit?: number) => useAllDocs({ limit }),
      {
        initialProps: 1,
        pouchdb: myPouch,
      }
    )

    await waitForNextUpdate(result)

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'a', key: 'a', value: { rev: revA } },
    ])

    rerender(5)

    await waitForNextUpdate(result)

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'a', key: 'a', value: { rev: revA } },
      { id: 'b', key: 'b', value: { rev: revB } },
    ])
  })

  test('should handle the skip option', async () => {
    const [{ rev: revA }, { rev: revB }] = await myPouch.bulkDocs([
      { _id: 'a', test: 'value' },
      { _id: 'b', test: 'other' },
    ])

    const { result, rerender } = renderHook(
      (skip?: number) => useAllDocs({ skip }),
      {
        initialProps: 1,
        pouchdb: myPouch,
      }
    )

    await waitForNextUpdate(result)

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'b', key: 'b', value: { rev: revB } },
    ])
    expect(result.current.offset).toBe(1)

    rerender(5)

    await waitForNextUpdate(result)

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([])
    expect(result.current.offset).toBe(5)

    rerender(0)

    await waitForNextUpdate(result)

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'a', key: 'a', value: { rev: revA } },
      { id: 'b', key: 'b', value: { rev: revB } },
    ])
    expect(result.current.offset).toBe(0)
  })

  test('should handle the descending option', async () => {
    const [{ rev: revA }, { rev: revB }] = await myPouch.bulkDocs([
      { _id: 'a', test: 'value' },
      { _id: 'b', test: 'other' },
    ])

    const { result, rerender } = renderHook(
      (descending: boolean) => useAllDocs({ descending }),
      {
        initialProps: false,
        pouchdb: myPouch,
      }
    )

    await waitForNextUpdate(result)

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'a', key: 'a', value: { rev: revA } },
      { id: 'b', key: 'b', value: { rev: revB } },
    ])

    rerender(true)

    await waitForNextUpdate(result)

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'b', key: 'b', value: { rev: revB } },
      { id: 'a', key: 'a', value: { rev: revA } },
    ])
  })

  test('should handle updates with the descending option', async () => {
    const [{ rev: revA }, { rev: revB }] = await myPouch.bulkDocs([
      { _id: 'a', test: 'value' },
      { _id: 'b', test: 'other' },
    ])

    const { result } = renderHook(() => useAllDocs({ descending: true }), {
      pouchdb: myPouch,
    })

    await waitForNextUpdate(result)

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'b', key: 'b', value: { rev: revB } },
      { id: 'a', key: 'a', value: { rev: revA } },
    ])

    let revC = 'fail'
    act(() => {
      myPouch.put({ _id: 'c', test: 'moar' }).then(result => {
        revC = result.rev
      })
    })

    await waitForNextUpdate(result)

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'c', key: 'c', value: { rev: revC } },
      { id: 'b', key: 'b', value: { rev: revB } },
      { id: 'a', key: 'a', value: { rev: revA } },
    ])
  })

  test('should handle the key option', async () => {
    const [{ rev: revA }, { rev: revB }] = await myPouch.bulkDocs([
      { _id: 'a', test: 'value' },
      { _id: 'b', test: 'other' },
    ])

    const { result, rerender } = renderHook(
      (key: string) => useAllDocs({ key }),
      {
        initialProps: 'a',
        pouchdb: myPouch,
      }
    )

    await waitForNextUpdate(result)

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'a', key: 'a', value: { rev: revA } },
    ])

    rerender('b')

    await waitForNextUpdate(result)

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'b', key: 'b', value: { rev: revB } },
    ])

    act(() => {
      myPouch.put({ _id: 'c', test: 'moar' })
    })

    await sleep(10)

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'b', key: 'b', value: { rev: revB } },
    ])
  })

  test('should handle the keys option', async () => {
    const [{ rev: revA }, { rev: revB }, { rev: revC }] =
      await myPouch.bulkDocs([
        { _id: 'a', test: 'value' },
        { _id: 'b', test: 'other' },
        { _id: 'c', test: 'moar' },
      ])

    const { result, rerender } = renderHook(
      (keys: string[]) => useAllDocs({ keys }),
      {
        initialProps: ['a'],
        pouchdb: myPouch,
      }
    )

    await waitForNextUpdate(result)

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'a', key: 'a', value: { rev: revA } },
    ])

    rerender(['c', 'b'])

    await waitForNextUpdate(result)

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'c', key: 'c', value: { rev: revC } },
      { id: 'b', key: 'b', value: { rev: revB } },
    ])

    act(() => {
      myPouch.put({ _id: 'd', test: 'moar' })
    })

    await sleep(10)

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'c', key: 'c', value: { rev: revC } },
      { id: 'b', key: 'b', value: { rev: revB } },
    ])
  })

  test("shouldn't query if keys content didn't change", async () => {
    const [{ rev: revA }] = await myPouch.bulkDocs([
      { _id: 'a', test: 'value' },
      { _id: 'b', test: 'other' },
      { _id: 'c', test: 'moar' },
    ])

    const { result, rerender } = renderHook(
      (keys: string[]) => useAllDocs({ keys }),
      {
        initialProps: ['a'],
        pouchdb: myPouch,
      }
    )

    await waitForNextUpdate(result)

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'a', key: 'a', value: { rev: revA } },
    ])

    rerender(['a'])

    expect(result.current.loading).toBe(false)
  })

  test('should handle the update_seq option', async () => {
    await myPouch.bulkDocs([
      { _id: 'a', test: 'value' },
      { _id: 'b', test: 'other' },
    ])

    const { result, rerender } = renderHook(
      (update_seq: boolean) => useAllDocs({ update_seq }),
      {
        initialProps: false,
        pouchdb: myPouch,
      }
    )

    await waitForNextUpdate(result)

    expect(result.current.state).toBe('done')
    expect(result.current.update_seq).toBeUndefined()

    rerender(true)

    await waitForNextUpdate(result)

    expect(result.current.state).toBe('done')
    expect(result.current.update_seq).not.toBeUndefined()
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
      (name?: string) => useAllDocs({ db: name, include_docs: true }),
      {
        initialProps: undefined,
        main: myPouch,
        other: other,
      }
    )

    await waitForNextUpdate(result)

    // No db selection
    expect(result.current.loading).toBeFalsy()
    expect(result.current.rows).toEqual([
      {
        id: 'test',
        key: 'test',
        value: { rev: expect.anything() },
        doc: {
          _id: 'test',
          _rev: expect.anything(),
          value: 'myPouch',
        },
      },
    ])

    // selecting a database that is not the default
    rerender('other')
    expect(result.current.loading).toBeTruthy()
    await waitForNextUpdate(result)

    expect(result.current.loading).toBeFalsy()
    expect(result.current.rows).toEqual([
      {
        id: 'test',
        key: 'test',
        value: { rev: expect.anything() },
        doc: {
          _id: 'test',
          _rev: expect.anything(),
          value: 'other',
        },
      },
    ])

    // selecting the default db by it's name
    rerender('main')
    expect(result.current.loading).toBeTruthy()
    await waitForNextUpdate(result)

    expect(result.current.loading).toBeFalsy()
    expect(result.current.rows).toEqual([
      {
        id: 'test',
        key: 'test',
        value: { rev: expect.anything() },
        doc: {
          _id: 'test',
          _rev: expect.anything(),
          value: 'myPouch',
        },
      },
    ])

    // reset to other db
    rerender('other')
    expect(result.current.loading).toBeTruthy()
    await waitForNextUpdate(result)

    // selecting by special _default key
    rerender('_default')
    await waitForNextUpdate(result)

    expect(result.current.rows).toEqual([
      {
        id: 'test',
        key: 'test',
        value: { rev: expect.anything() },
        doc: {
          _id: 'test',
          _rev: expect.anything(),
          value: 'myPouch',
        },
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
    } as TestPost)

    await myPouch.put({
      _id: 'post_2',
      type: 'post',
      title: 'Second Post',
      site_id: 'site_2',
      author_id: 'user_2',
    } as TestPost)
  })

  test('should populate documents with include_docs', async () => {
    const populateConfig: PopulateConfig = {
      site_id: { as: 'site' },
      author_id: { as: 'author' },
    }

    const { result } = renderHook(
      () =>
        useAllDocs<TestPost>({
          include_docs: true,
          startkey: 'post_',
          endkey: 'post_\ufff0',
          populate: populateConfig,
        }),
      { pouchdb: myPouch }
    )

    await waitForNextUpdate(result)

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toHaveLength(2)

    // Check first post
    const firstRow = result.current.rows[0]
    expect(firstRow.doc).toBeDefined()
    const firstDoc = firstRow.doc as TestPost & {
      site: TestSite
      author: TestUser
    }
    expect(firstDoc._id).toBe('post_1')
    expect(firstDoc.site).toBeDefined()
    expect(firstDoc.site.name).toBe('Tech Blog')
    expect(firstDoc.author).toBeDefined()
    expect(firstDoc.author.name).toBe('John Doe')

    // Check second post
    const secondRow = result.current.rows[1]
    expect(secondRow.doc).toBeDefined()
    const secondDoc = secondRow.doc as TestPost & {
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
        useAllDocs<TestPost>({
          include_docs: true,
          startkey: 'post_',
          endkey: 'post_\ufff0',
        }),
      { pouchdb: myPouch }
    )

    await waitForNextUpdate(result)

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toHaveLength(2)

    // Check that documents are not populated
    const firstDoc = result.current.rows[0].doc as TestPost
    expect(firstDoc._id).toBe('post_1')
    expect(firstDoc.site).toBeUndefined()
    expect(firstDoc.author).toBeUndefined()
  })

  test('should not populate without include_docs', async () => {
    const populateConfig: PopulateConfig = {
      site_id: { as: 'site' },
    }

    const { result } = renderHook(
      () =>
        useAllDocs<TestPost>({
          startkey: 'post_',
          endkey: 'post_\ufff0',
          populate: populateConfig,
        }),
      { pouchdb: myPouch }
    )

    await waitForNextUpdate(result)

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toHaveLength(2)

    // Without include_docs, rows should not have doc property
    expect(result.current.rows[0].doc).toBeUndefined()
    expect(result.current.rows[1].doc).toBeUndefined()
  })

  test('should handle missing references gracefully', async () => {
    // Create a post with a missing reference
    await myPouch.put({
      _id: 'post_3',
      type: 'post',
      title: 'Third Post',
      site_id: 'nonexistent_site',
      author_id: 'user_1',
    } as TestPost)

    const populateConfig: PopulateConfig = {
      site_id: { as: 'site' },
      author_id: { as: 'author' },
    }

    const { result } = renderHook(
      () =>
        useAllDocs<TestPost>({
          include_docs: true,
          startkey: 'post_3',
          endkey: 'post_3',
          populate: populateConfig,
        }),
      { pouchdb: myPouch }
    )

    await waitForNextUpdate(result)

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toHaveLength(1)

    const doc = result.current.rows[0].doc as TestPost & {
      site?: TestSite
      author: TestUser
    }
    expect(doc._id).toBe('post_3')

    // Missing reference should not be populated
    expect(doc.site).toBeUndefined()

    // Valid reference should be populated
    expect(doc.author).toBeDefined()
    expect(doc.author.name).toBe('John Doe')
  })

  test('should populate with specific keys', async () => {
    const populateConfig: PopulateConfig = {
      site_id: { as: 'site' },
    }

    const { result } = renderHook(
      () =>
        useAllDocs<TestPost>({
          include_docs: true,
          keys: ['post_1', 'post_2'],
          populate: populateConfig,
        }),
      { pouchdb: myPouch }
    )

    await waitForNextUpdate(result)

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toHaveLength(2)

    // Both documents should be populated
    const firstDoc = result.current.rows[0].doc as TestPost & { site: TestSite }
    const secondDoc = result.current.rows[1].doc as TestPost & {
      site: TestSite
    }

    expect(firstDoc.site).toBeDefined()
    expect(firstDoc.site.name).toBe('Tech Blog')

    expect(secondDoc.site).toBeDefined()
    expect(secondDoc.site.name).toBe('News Site')
  })

  test('should populate data correctly with different reference documents', async () => {
    // Create a third post that references site_2 from the start
    await myPouch.put({
      _id: 'post_3',
      type: 'post',
      title: 'Third Post',
      site_id: 'site_2',
      author_id: 'user_2',
    } as TestPost)

    const populateConfig: PopulateConfig = {
      site_id: { as: 'site' },
      author_id: { as: 'author' },
    }

    const { result } = renderHook(
      () =>
        useAllDocs<TestPost>({
          include_docs: true,
          startkey: 'post_3',
          endkey: 'post_3',
          populate: populateConfig,
        }),
      { pouchdb: myPouch }
    )

    await waitForNextUpdate(result)

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toHaveLength(1)

    const doc = result.current.rows[0].doc as TestPost & {
      site: TestSite
      author: TestUser
    }
    expect(doc._id).toBe('post_3')
    expect(doc.title).toBe('Third Post')

    // Verify population worked correctly
    expect(doc.site).toBeDefined()
    expect(doc.site.name).toBe('News Site')
    expect(doc.site.domain).toBe('news.com')

    expect(doc.author).toBeDefined()
    expect(doc.author.name).toBe('Jane Smith')
    expect(doc.author.email).toBe('jane@example.com')
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
      _id: 'post_4',
      type: 'post',
      title: 'Fourth Post',
      site_id: 'site_different_type',
      author_id: 'user_1',
    } as TestPost)

    const populateConfig: PopulateConfig = {
      site_id: { as: 'site' },
      author_id: { as: 'author' },
    }

    const { result } = renderHook(
      () =>
        useAllDocs<TestPost>({
          include_docs: true,
          startkey: 'post_4',
          endkey: 'post_4',
          populate: populateConfig,
        }),
      { pouchdb: myPouch }
    )

    await waitForNextUpdate(result)

    expect(result.current.state).toBe('done')
    const doc = result.current.rows[0].doc as TestPost & {
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
})
