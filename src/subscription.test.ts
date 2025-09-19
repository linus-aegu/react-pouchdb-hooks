import PouchDB from 'pouchdb-core'
import memory from 'pouchdb-adapter-memory'
import mapReduce from 'pouchdb-mapreduce'

import SubscriptionManager from './subscription'

import { sleep } from './test-utils'

PouchDB.plugin(memory)
PouchDB.plugin(mapReduce)

let myPouch: PouchDB.Database

beforeEach(() => {
  myPouch = new PouchDB('test', { adapter: 'memory' })
})

afterEach(async () => {
  await myPouch.destroy()
})

const emit = (key: unknown, value?: unknown) => {
  console.log('this is only for typescript and eslint', key, value)
}

test('should have subscription methods for docs and views', () => {
  const subscriptionManager = new SubscriptionManager(myPouch)

  expect(typeof subscriptionManager).toBe('object')
  expect(typeof subscriptionManager.subscribeToDocs).toBe('function')
  expect(typeof subscriptionManager.subscribeToView).toBe('function')
})

test('should subscribe to document updates', () => {
  const changesObject = {
    on: jest.fn(() => changesObject),
    cancel: jest.fn(),
  }
  const changes = jest.fn(() => changesObject)
  const callback = jest.fn()

  myPouch.changes = changes

  const subscriptionManager = new SubscriptionManager(myPouch)

  const unsubscribe = subscriptionManager.subscribeToDocs(
    ['test', 'userDoc', 'other'],
    callback,
  )

  expect(changes).toHaveBeenCalledWith({
    since: 'now',
    live: true,
    include_docs: true,
  })
  expect(changesObject.on).toHaveBeenCalled()
  expect(changesObject.cancel).not.toHaveBeenCalled()

  unsubscribe()

  expect(changesObject.cancel).toHaveBeenCalled()
  expect(callback).not.toHaveBeenCalled()
})

test('should only subscribe once to document updates', () => {
  const changesObject = {
    on: jest.fn(() => changesObject),
    cancel: jest.fn(),
  }
  const changes = jest.fn(() => changesObject)
  const callback1 = jest.fn()
  const callback2 = jest.fn()

  myPouch.changes = changes

  const subscriptionManager = new SubscriptionManager(myPouch)

  const unsubscribe = subscriptionManager.subscribeToDocs(
    ['test', 'userDoc', 'other'],
    callback1,
  )
  const unsubscribe2 = subscriptionManager.subscribeToDocs(
    ['moar', 'why_couchdb_is_awesome'],
    callback2,
  )

  expect(changes).toHaveBeenCalledTimes(1)
  expect(changesObject.cancel).not.toHaveBeenCalled()

  unsubscribe()
  expect(changesObject.cancel).not.toHaveBeenCalled()

  const callback3 = jest.fn()

  const unsubscribe3 = subscriptionManager.subscribeToDocs(
    ['why_pouchdb_is_needed'],
    callback3,
  )
  expect(changes).toHaveBeenCalledTimes(1)

  unsubscribe2()
  expect(changesObject.cancel).not.toHaveBeenCalled()

  unsubscribe3()
  expect(changesObject.cancel).toHaveBeenCalled()

  expect(callback1).not.toHaveBeenCalled()
  expect(callback2).not.toHaveBeenCalled()
  expect(callback3).not.toHaveBeenCalled()
})

test('should handle unsubscribing during an doc update', () => {
  const { changes, get } = myPouch

  const doc = {
    _id: 'test',
    _rev: '1-fb7e8b3df19087a905ab792366bd118a',
    value: 42,
  }

  let callback: (
    change: PouchDB.Core.ChangesResponseChange<Record<string, unknown>>,
  ) => void = () => {
    console.error('should not be called')
  }

  ;(myPouch as unknown as { changes: unknown }).changes = () => ({
    on(_type: string, callFn: (c: unknown) => void) {
      callback = callFn
      return {
        cancel: jest.fn(),
      }
    },
  })

  const subscriptionManager = new SubscriptionManager(myPouch)
  const unsubscribe = subscriptionManager.subscribeToDocs(['test'], jest.fn())

  let getCallback: (doc: unknown) => void = jest.fn()
  ;(myPouch as unknown as { get: unknown }).get = jest.fn(() => {
    return {
      then(fn: (doc: unknown) => void) {
        getCallback = fn
        return { catch: jest.fn() }
      },
    }
  })

  callback({
    id: 'test',
    seq: 1,
    changes: [{ rev: doc._rev }],
    doc,
  })
  unsubscribe()
  myPouch.changes = changes
  myPouch.get = get
  expect(() => getCallback(doc)).not.toThrow()
})

test('should subscribe to view updates', () => {
  const changesObject = {
    on: jest.fn(() => changesObject),
    cancel: jest.fn(),
  }
  const changes = jest.fn(() => changesObject)
  const callback = jest.fn()

  myPouch.changes = changes

  const subscriptionManager = new SubscriptionManager(myPouch)

  const unsubscribe = subscriptionManager.subscribeToView(
    'ddoc/aView',
    callback,
  )

  expect(changes).toHaveBeenCalledWith({
    since: 'now',
    live: true,
    filter: '_view',
    view: 'ddoc/aView',
  })
  expect(changesObject.on).toHaveBeenCalled()
  expect(changesObject.cancel).not.toHaveBeenCalled()

  unsubscribe()

  expect(changesObject.cancel).toHaveBeenCalled()
  expect(callback).not.toHaveBeenCalled()
})

test('should subscribe a view updates only once', () => {
  const changesObject = {
    on: jest.fn(() => changesObject),
    cancel: jest.fn(),
  }
  const changes = jest.fn(() => changesObject)
  const callback1 = jest.fn()

  myPouch.changes = changes

  const subscriptionManager = new SubscriptionManager(myPouch)

  const unsubscribe = subscriptionManager.subscribeToView(
    'ddoc/aView',
    callback1,
  )

  expect(changes).toHaveBeenCalledTimes(1)
  expect(changesObject.cancel).not.toHaveBeenCalled()

  const callback2 = jest.fn()

  const unsubscribeSame = subscriptionManager.subscribeToView(
    'ddoc/aView',
    callback2,
  )
  expect(changes).toHaveBeenCalledTimes(1)
  expect(changesObject.cancel).not.toHaveBeenCalled()

  unsubscribe()
  expect(changesObject.cancel).not.toHaveBeenCalled()

  const callback3 = jest.fn()

  const unsubscribeOther = subscriptionManager.subscribeToView(
    'ddoc/otherView',
    callback3,
  )
  expect(changes).toHaveBeenCalledTimes(2)
  expect(changes).toHaveBeenLastCalledWith({
    since: 'now',
    live: true,
    filter: '_view',
    view: 'ddoc/otherView',
  })
  expect(changesObject.cancel).not.toHaveBeenCalled()

  unsubscribeSame()
  expect(changesObject.cancel).toHaveBeenCalled()

  unsubscribeOther()
  expect(changesObject.cancel).toHaveBeenCalledTimes(2)

  expect(callback1).not.toHaveBeenCalled()
  expect(callback2).not.toHaveBeenCalled()
  expect(callback3).not.toHaveBeenCalled()
})

test('should call the callback to documents with a document and to views with an id', async () => {
  await myPouch.put({
    _id: '_design/test',
    views: {
      test: {
        map: function (doc: Record<string, unknown>) {
          emit(doc.id)
        }.toString(),
      },
    },
  })

  const docCallback = jest.fn()
  const viewCallback = jest.fn()

  const subscriptionManager = new SubscriptionManager(myPouch)

  const unsubscribeDocs = subscriptionManager.subscribeToDocs(
    ['a_document'],
    docCallback,
  )
  const unsubscribeView = subscriptionManager.subscribeToView(
    'test',
    viewCallback,
  )

  const putResult = await myPouch.put({
    _id: 'a_document',
    value: 42,
  })

  await sleep(50)

  expect(docCallback).toHaveBeenCalled()
  expect(typeof docCallback.mock.calls[0]).toBe('object')
  expect(docCallback.mock.calls[0][1]).toBe('a_document')
  expect(docCallback.mock.calls[0][2]._id).toBe('a_document')
  expect(typeof docCallback.mock.calls[0][2]._rev).toBe('string')
  expect(docCallback.mock.calls[0][2].value).toBe(42)

  expect(viewCallback).toHaveBeenCalledWith('a_document')

  unsubscribeDocs()
  unsubscribeView()

  await myPouch.put({
    _id: 'a_document',
    _rev: putResult.rev,
    value: 'and the question is:',
  })

  await sleep(10)

  expect(docCallback).toHaveBeenCalledTimes(1)
  expect(viewCallback).toHaveBeenCalledTimes(1)
})

test('should have a unsubscribeAll method', async () => {
  await myPouch.put({
    _id: '_design/test',
    views: {
      test: {
        map: function (doc: Record<string, unknown>) {
          emit(doc.id)
        }.toString(),
      },
    },
  })

  const docCallback = jest.fn()
  const allDocCallback = jest.fn()
  const viewCallback = jest.fn()

  const subscriptionManager = new SubscriptionManager(myPouch)

  const unsubscribeDocs = subscriptionManager.subscribeToDocs(
    ['a_document'],
    docCallback,
  )
  const unsubscribeAllDocs = subscriptionManager.subscribeToDocs(
    null,
    allDocCallback,
  )
  const unsubscribeView = subscriptionManager.subscribeToView(
    'test',
    viewCallback,
  )

  subscriptionManager.unsubscribeAll()

  await myPouch.put({
    _id: 'a_document',
    value: 42,
  })

  await sleep(50)

  expect(docCallback).not.toHaveBeenCalled()
  expect(allDocCallback).not.toHaveBeenCalled()
  expect(viewCallback).not.toHaveBeenCalled()

  // doesn't throw
  unsubscribeDocs()
  unsubscribeAllDocs()
  unsubscribeView()
})

test('should subscribe to destroy events', async () => {
  const db = new PouchDB('other', { adapter: 'memory' })
  const subscriptionManager = new SubscriptionManager(db)

  const unsubscribeAll = subscriptionManager.unsubscribeAll
  subscriptionManager.unsubscribeAll = jest.fn((...args) =>
    unsubscribeAll.call(subscriptionManager, args),
  )

  await db.destroy()

  expect(subscriptionManager.unsubscribeAll).toHaveBeenCalled()
})

test('should clone the documents that are passed to document callbacks', async () => {
  const docs: (PouchDB.Core.IdMeta | undefined)[] = []

  // Disable batching for immediate callback execution
  const subscriptionManager = new SubscriptionManager(myPouch, {
    enableBatching: false,
  })

  const unsubscribe1 = subscriptionManager.subscribeToDocs(
    ['a_document'],
    (_deleted, _id, doc) => {
      docs.push(doc)
    },
  )
  const unsubscribe2 = subscriptionManager.subscribeToDocs(
    ['a_document'],
    (_deleted, _id, doc) => {
      docs.push(doc)
    },
  )

  await myPouch.put({
    _id: 'a_document',
    value: 42,
  })

  await sleep(10)

  // Ensure we have documents before trying to modify them
  expect(docs).toHaveLength(2)
  expect(docs[0]).toBeDefined()
  expect(docs[1]).toBeDefined()
  ;(docs[0] as PouchDB.Core.IdMeta & { value: number }).value = 43

  expect((docs[0] as PouchDB.Core.IdMeta & { value: number }).value).toBe(43)
  expect((docs[1] as PouchDB.Core.IdMeta & { value: number }).value).toBe(42)

  unsubscribe1()
  unsubscribe2()
})

test('should subscribe to all docs if null is passed to doc subscription', async () => {
  // Disable batching for immediate callback execution
  const subscriptionManager = new SubscriptionManager(myPouch, {
    enableBatching: false,
  })

  const callback = jest.fn()

  const unsubscribe = subscriptionManager.subscribeToDocs(null, callback)

  const docs: Array<PouchDB.Core.IdMeta & { value: number }> = []
  for (let i = 0; i < 15; ++i) {
    docs.push({
      _id: 'doc_' + Math.random(),
      value: i,
    })
  }
  await myPouch.bulkDocs(docs)

  await sleep(50)

  expect(callback).toHaveBeenCalledTimes(15)

  unsubscribe()
})

test('should use include_docs to avoid separate get calls', () => {
  const changesObject = {
    on: jest.fn(() => changesObject),
    cancel: jest.fn(),
  }
  const changes = jest.fn(() => changesObject)
  const callback = jest.fn()

  myPouch.changes = changes

  const subscriptionManager = new SubscriptionManager(myPouch)

  subscriptionManager.subscribeToDocs(['test'], callback)

  // Should call changes with include_docs: true
  expect(changes).toHaveBeenCalledWith({
    since: 'now',
    live: true,
    include_docs: true,
  })
})

test('should batch rapid changes when batching is enabled', async () => {
  const changesObject = {
    on: jest.fn(() => changesObject),
    cancel: jest.fn(),
  }
  const changes = jest.fn(() => changesObject)
  const callback = jest.fn()

  myPouch.changes = changes

  // Enable batching with short delay for testing, disable leading edge for traditional batching
  const subscriptionManager = new SubscriptionManager(myPouch, {
    enableBatching: true,
    batchDelay: 10,
    leadingEdge: false,
  })

  subscriptionManager.subscribeToDocs(['test1', 'test2'], callback)

  // Get the change handler
  const changeHandler = changesObject.on.mock.calls.find(
    call => call[0] === 'change',
  )[1]

  // Simulate rapid changes
  changeHandler({
    id: 'test1',
    seq: 1,
    changes: [{ rev: '1-abc' }],
    doc: { _id: 'test1', _rev: '1-abc', value: 1 },
  })

  changeHandler({
    id: 'test2',
    seq: 2,
    changes: [{ rev: '1-def' }],
    doc: { _id: 'test2', _rev: '1-def', value: 2 },
  })

  // Callback should not be called immediately
  expect(callback).not.toHaveBeenCalled()

  // Wait for batch to process
  await new Promise(resolve => setTimeout(resolve, 15))

  // Callback should be called for both changes
  expect(callback).toHaveBeenCalledTimes(2)
  expect(callback).toHaveBeenCalledWith(
    false,
    'test1',
    expect.objectContaining({ _id: 'test1', value: 1 }),
  )
  expect(callback).toHaveBeenCalledWith(
    false,
    'test2',
    expect.objectContaining({ _id: 'test2', value: 2 }),
  )
})

test('should process changes immediately when batching is disabled', () => {
  const changesObject = {
    on: jest.fn(() => changesObject),
    cancel: jest.fn(),
  }
  const changes = jest.fn(() => changesObject)
  const callback = jest.fn()

  myPouch.changes = changes

  // Disable batching
  const subscriptionManager = new SubscriptionManager(myPouch, {
    enableBatching: false,
  })

  subscriptionManager.subscribeToDocs(['test'], callback)

  // Get the change handler
  const changeHandler = changesObject.on.mock.calls.find(
    call => call[0] === 'change',
  )[1]

  // Simulate change
  changeHandler({
    id: 'test',
    seq: 1,
    changes: [{ rev: '1-abc' }],
    doc: { _id: 'test', _rev: '1-abc', value: 1 },
  })

  // Callback should be called immediately
  expect(callback).toHaveBeenCalledTimes(1)
  expect(callback).toHaveBeenCalledWith(
    false,
    'test',
    expect.objectContaining({ _id: 'test', value: 1 }),
  )
})

test('should handle deleted documents with include_docs', () => {
  const changesObject = {
    on: jest.fn(() => changesObject),
    cancel: jest.fn(),
  }
  const changes = jest.fn(() => changesObject)
  const callback = jest.fn()

  myPouch.changes = changes

  // Disable batching for immediate callback execution
  const subscriptionManager = new SubscriptionManager(myPouch, {
    enableBatching: false,
  })
  subscriptionManager.subscribeToDocs(['test'], callback)

  // Get the change handler
  const changeHandler = changesObject.on.mock.calls.find(
    call => call[0] === 'change',
  )[1]

  // Simulate deleted document
  changeHandler({
    id: 'test',
    seq: 2,
    changes: [{ rev: '2-deleted' }],
    deleted: true,
    doc: null,
  })

  expect(callback).toHaveBeenCalledWith(true, 'test', undefined)
})

test('should clear pending changes on unsubscribe', async () => {
  const changesObject = {
    on: jest.fn(() => changesObject),
    cancel: jest.fn(),
  }
  const changes = jest.fn(() => changesObject)
  const callback = jest.fn()

  myPouch.changes = changes

  const subscriptionManager = new SubscriptionManager(myPouch, {
    enableBatching: true,
    batchDelay: 50, // Longer delay
    leadingEdge: false, // Disable leading edge for traditional batching behavior
  })

  const unsubscribe = subscriptionManager.subscribeToDocs(['test'], callback)

  // Get the change handler
  const changeHandler = changesObject.on.mock.calls.find(
    call => call[0] === 'change',
  )[1]

  // Simulate change
  changeHandler({
    id: 'test',
    seq: 1,
    changes: [{ rev: '1-abc' }],
    doc: { _id: 'test', _rev: '1-abc', value: 1 },
  })

  // Unsubscribe before batch processes
  unsubscribe()

  // Wait longer than batch delay
  await new Promise(resolve => setTimeout(resolve, 60))

  // Callback should not be called since we unsubscribed
  expect(callback).not.toHaveBeenCalled()
})

test('should process first change immediately with leading edge batching', async () => {
  const changesObject = {
    on: jest.fn(() => changesObject),
    cancel: jest.fn(),
  }
  const changes = jest.fn(() => changesObject)
  const callback = jest.fn()

  myPouch.changes = changes

  // Enable leading edge batching
  const subscriptionManager = new SubscriptionManager(myPouch, {
    enableBatching: true,
    batchDelay: 50,
    leadingEdge: true,
  })

  subscriptionManager.subscribeToDocs(['test'], callback)

  // Get the change handler
  const changeHandler = changesObject.on.mock.calls.find(
    call => call[0] === 'change',
  )[1]

  // First change should be processed immediately
  changeHandler({
    id: 'test',
    seq: 1,
    changes: [{ rev: '1-abc' }],
    doc: { _id: 'test', _rev: '1-abc', value: 1 },
  })

  // Should be called immediately
  expect(callback).toHaveBeenCalledTimes(1)
  expect(callback).toHaveBeenCalledWith(
    false,
    'test',
    expect.objectContaining({ _id: 'test', value: 1 }),
  )

  // Second change should be batched
  changeHandler({
    id: 'test',
    seq: 2,
    changes: [{ rev: '2-def' }],
    doc: { _id: 'test', _rev: '2-def', value: 2 },
  })

  // Should still be called only once (second change is batched)
  expect(callback).toHaveBeenCalledTimes(1)

  // Wait for batch to process
  await new Promise(resolve => setTimeout(resolve, 60))

  // Now should be called for the second change
  expect(callback).toHaveBeenCalledTimes(2)
  expect(callback).toHaveBeenLastCalledWith(
    false,
    'test',
    expect.objectContaining({ _id: 'test', value: 2 }),
  )
})

test('should batch all changes when leading edge is disabled', async () => {
  const changesObject = {
    on: jest.fn(() => changesObject),
    cancel: jest.fn(),
  }
  const changes = jest.fn(() => changesObject)
  const callback = jest.fn()

  myPouch.changes = changes

  // Disable leading edge batching
  const subscriptionManager = new SubscriptionManager(myPouch, {
    enableBatching: true,
    batchDelay: 20,
    leadingEdge: false,
  })

  subscriptionManager.subscribeToDocs(['test1', 'test2'], callback)

  // Get the change handler
  const changeHandler = changesObject.on.mock.calls.find(
    call => call[0] === 'change',
  )[1]

  // First change should NOT be processed immediately
  changeHandler({
    id: 'test1',
    seq: 1,
    changes: [{ rev: '1-abc' }],
    doc: { _id: 'test1', _rev: '1-abc', value: 1 },
  })

  // Should not be called immediately
  expect(callback).not.toHaveBeenCalled()

  // Second change (different document ID)
  changeHandler({
    id: 'test2',
    seq: 2,
    changes: [{ rev: '2-def' }],
    doc: { _id: 'test2', _rev: '2-def', value: 2 },
  })

  // Still should not be called
  expect(callback).not.toHaveBeenCalled()

  // Wait for batch to process
  await new Promise(resolve => setTimeout(resolve, 30))

  // Now should be called for both changes
  expect(callback).toHaveBeenCalledTimes(2)
})

test('should handle multiple rapid changes with leading edge', async () => {
  const changesObject = {
    on: jest.fn(() => changesObject),
    cancel: jest.fn(),
  }
  const changes = jest.fn(() => changesObject)
  const callback = jest.fn()

  myPouch.changes = changes

  const subscriptionManager = new SubscriptionManager(myPouch, {
    enableBatching: true,
    batchDelay: 30,
    leadingEdge: true,
  })

  subscriptionManager.subscribeToDocs(['test'], callback)

  const changeHandler = changesObject.on.mock.calls.find(
    call => call[0] === 'change',
  )[1]

  // Simulate rapid changes
  for (let i = 1; i <= 5; i++) {
    changeHandler({
      id: 'test',
      seq: i,
      changes: [{ rev: `${i}-abc` }],
      doc: { _id: 'test', _rev: `${i}-abc`, value: i },
    })
  }

  // First change should be processed immediately
  expect(callback).toHaveBeenCalledTimes(1)
  expect(callback).toHaveBeenCalledWith(
    false,
    'test',
    expect.objectContaining({ value: 1 }),
  )

  // Wait for batch to process remaining changes
  await new Promise(resolve => setTimeout(resolve, 40))

  // Should have processed the last change (value: 5) since pending changes
  // map overwrites previous values for the same ID
  expect(callback).toHaveBeenCalledTimes(2)
  expect(callback).toHaveBeenLastCalledWith(
    false,
    'test',
    expect.objectContaining({ value: 5 }),
  )
})
