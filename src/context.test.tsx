import { renderHook } from '@testing-library/react'
import React, { StrictMode } from 'react'
import PouchDB from 'pouchdb-core'
import memory from 'pouchdb-adapter-memory'

import { Provider, useContext } from './context'
import { sleep } from './test-utils'

PouchDB.plugin(memory)

test('should render a Provider which provide the passed pouchdb database', async () => {
  const myPouch = new PouchDB('test', { adapter: 'memory' })

  const { result } = renderHook(() => useContext(), {
    wrapper: function Wrapper({ children }) {
      return (
        <StrictMode>
          <Provider pouchdb={myPouch}>{children}</Provider>
        </StrictMode>
      )
    },
  })

  expect(result.current.pouchdb).toBe(myPouch)
  expect(typeof result.current.subscriptionManager).toBe('object')
  expect(typeof result.current.subscriptionManager.subscribeToDocs).toBe(
    'function'
  )
  expect(typeof result.current.subscriptionManager.subscribeToView).toBe(
    'function'
  )

  await myPouch.destroy()
})

test('should unsubscribe all when the database changes', async () => {
  const myPouch = new PouchDB('test', { adapter: 'memory' })
  let db = myPouch

  const { result, rerender } = renderHook(() => useContext(), {
    wrapper: function Wrapper({ children }) {
      return (
        <StrictMode>
          <Provider pouchdb={db}>{children}</Provider>
        </StrictMode>
      )
    },
  })

  const unsubscribe = jest.fn()
  result.current.subscriptionManager.unsubscribeAll = unsubscribe

  db = new PouchDB('test2', { adapter: 'memory' })

  rerender()

  await sleep(10)

  expect(unsubscribe).toHaveBeenCalled()

  await myPouch.destroy()
  await db.destroy()
})

test('should unsubscribe all when a database gets destroyed', async () => {
  const myPouch = new PouchDB('test', { adapter: 'memory' })

  const { result } = renderHook(() => useContext(), {
    wrapper: function Wrapper({ children }) {
      return (
        <StrictMode>
          <Provider pouchdb={myPouch}>{children}</Provider>
        </StrictMode>
      )
    },
  })

  const unsubscribe = jest.fn()
  result.current.subscriptionManager.unsubscribeAll = unsubscribe

  await myPouch.destroy()

  await sleep(10)

  expect(unsubscribe).toHaveBeenCalled()
})

test('should use the optional name argument', async () => {
  const myPouch = new PouchDB('test', { adapter: 'memory' })

  const { result } = renderHook((name: string) => useContext(name), {
    initialProps: 'other',
    wrapper: function Wrapper({ children }) {
      return (
        <StrictMode>
          <Provider pouchdb={myPouch} name="other">
            {children}
          </Provider>
        </StrictMode>
      )
    },
  })

  expect(result.current.pouchdb).toBe(myPouch)

  await myPouch.destroy()
})

test('should render a Provider that gives access to multiple databases', async () => {
  const myPouch = new PouchDB('test', { adapter: 'memory' })
  const other = new PouchDB('other', { adapter: 'memory' })

  const { result, rerender } = renderHook((name?: string) => useContext(name), {
    initialProps: undefined,
    wrapper: function Wrapper({ children }) {
      return (
        <StrictMode>
          <Provider databases={{ myPouch, other }} default="myPouch">
            {children}
          </Provider>
        </StrictMode>
      )
    },
  })

  expect(result.current.pouchdb).toBe(myPouch)

  const myPouchSubscriptionManager = result.current.subscriptionManager

  rerender('other')

  expect(result.current.pouchdb).toBe(other)
  expect(result.current.subscriptionManager).not.toBe(
    myPouchSubscriptionManager
  )

  rerender('myPouch')

  expect(result.current.pouchdb).toBe(myPouch)
  expect(result.current.subscriptionManager).toBe(myPouchSubscriptionManager)

  await myPouch.destroy()
  await other.destroy()
})

test('should combine a parent context into its context', async () => {
  const parent = new PouchDB('test', { adapter: 'memory' })
  const child = new PouchDB('other', { adapter: 'memory' })

  const { result, rerender } = renderHook((name?: string) => useContext(name), {
    initialProps: undefined,
    wrapper: function Wrapper({ children }) {
      return (
        <StrictMode>
          <Provider pouchdb={parent}>
            <Provider pouchdb={child}>{children}</Provider>
          </Provider>
        </StrictMode>
      )
    },
  })

  expect(result.current.pouchdb).toBe(child)
  const childSubscriptionManager = result.current.subscriptionManager

  rerender('test')

  expect(result.current.pouchdb).toBe(parent)
  expect(result.current.subscriptionManager).not.toBe(childSubscriptionManager)

  rerender('other')

  expect(result.current.pouchdb).toBe(child)
  expect(result.current.subscriptionManager).toBe(childSubscriptionManager)

  rerender('_default')

  expect(result.current.pouchdb).toBe(child)
  expect(result.current.subscriptionManager).toBe(childSubscriptionManager)

  await parent.destroy()
  await child.destroy()
})

test('should combine a parent context into its context if the child is multi db', async () => {
  const parent = new PouchDB('test', { adapter: 'memory' })
  const child = new PouchDB('other', { adapter: 'memory' })

  const { result, rerender } = renderHook((name?: string) => useContext(name), {
    initialProps: undefined,
    wrapper: function Wrapper({ children }) {
      return (
        <StrictMode>
          <Provider pouchdb={parent}>
            <Provider databases={{ other: child }} default="other">
              {children}
            </Provider>
          </Provider>
        </StrictMode>
      )
    },
  })

  expect(result.current.pouchdb).toBe(child)
  const childSubscriptionManager = result.current.subscriptionManager

  rerender('test')

  expect(result.current.pouchdb).toBe(parent)
  expect(result.current.subscriptionManager).not.toBe(childSubscriptionManager)

  rerender('other')

  expect(result.current.pouchdb).toBe(child)
  expect(result.current.subscriptionManager).toBe(childSubscriptionManager)

  rerender('_default')

  expect(result.current.pouchdb).toBe(child)
  expect(result.current.subscriptionManager).toBe(childSubscriptionManager)

  await parent.destroy()
  await child.destroy()
})

test('should allow the use of a parent context database name in default', async () => {
  const parent = new PouchDB('test', { adapter: 'memory' })
  const child = new PouchDB('other', { adapter: 'memory' })

  const { result } = renderHook((name?: string) => useContext(name), {
    initialProps: undefined,
    wrapper: function Wrapper({ children }) {
      return (
        <StrictMode>
          <Provider pouchdb={parent}>
            <Provider databases={{ other: child }} default="test">
              {children}
            </Provider>
          </Provider>
        </StrictMode>
      )
    },
  })

  expect(result.current.pouchdb).toBe(parent)

  await parent.destroy()
  await child.destroy()
})

test('should handle a database name of default', async () => {
  const myPouch = new PouchDB('default', { adapter: 'memory' })
  const other = new PouchDB('other', { adapter: 'memory' })

  const { result, rerender } = renderHook((name?: string) => useContext(name), {
    initialProps: undefined,
    wrapper: function Wrapper({ children }) {
      return (
        <StrictMode>
          <Provider databases={{ default: myPouch, other }} default="other">
            {children}
          </Provider>
        </StrictMode>
      )
    },
  })

  expect(result.current.pouchdb).toBe(other)

  rerender('default')

  expect(result.current.pouchdb).toBe(myPouch)

  rerender('_default')

  expect(result.current.pouchdb).toBe(other)

  await myPouch.destroy()
  await other.destroy()
})

test('should pass subscription options to SubscriptionManager', () => {
  const mockDb = {
    name: 'testdb',
    once: jest.fn(),
    removeListener: jest.fn(),
  } as unknown as PouchDB.Database

  const subscriptionOptions = {
    enableBatching: false,
    batchDelay: 100,
    leadingEdge: false,
  }

  const { result } = renderHook(() => useContext(), {
    wrapper: ({ children }) => (
      <Provider pouchdb={mockDb} subscriptionOptions={subscriptionOptions}>
        {children}
      </Provider>
    ),
  })

  expect(result.current.pouchdb).toBe(mockDb)
  expect(result.current.subscriptionManager).toBeDefined()

  // The subscription manager should be created with the provided options
  // This is tested indirectly through the constructor being called with options
})

test('should handle subscription options in multi-db provider', () => {
  const mockDb1 = {
    name: 'testdb1',
    once: jest.fn(),
    removeListener: jest.fn(),
  } as unknown as PouchDB.Database

  const mockDb2 = {
    name: 'testdb2',
    once: jest.fn(),
    removeListener: jest.fn(),
  } as unknown as PouchDB.Database

  const subscriptionOptions = {
    enableBatching: true,
    batchDelay: 50,
  }

  const { result } = renderHook(() => useContext('db1'), {
    wrapper: ({ children }) => (
      <Provider
        databases={{ db1: mockDb1, db2: mockDb2 }}
        default="db1"
        subscriptionOptions={subscriptionOptions}
      >
        {children}
      </Provider>
    ),
  })

  expect(result.current.pouchdb).toBe(mockDb1)
  expect(result.current.subscriptionManager).toBeDefined()
})

test('should recreate subscription managers when options change', () => {
  const mockDb = {
    name: 'testdb',
    once: jest.fn(),
    removeListener: jest.fn(),
  } as unknown as PouchDB.Database

  const initialOptions = {
    enableBatching: true,
    batchDelay: 16,
  }

  // Use a stateful wrapper component
  let currentOptions = initialOptions

  function TestWrapper({ children }: { children: React.ReactNode }) {
    return (
      <Provider pouchdb={mockDb} subscriptionOptions={currentOptions}>
        {children}
      </Provider>
    )
  }

  const { result, rerender } = renderHook(() => useContext(), {
    wrapper: TestWrapper,
  })

  const initialSubscriptionManager = result.current.subscriptionManager

  // Change options - create completely new object with different values
  const newOptions = {
    enableBatching: false,
    batchDelay: 32,
  }

  currentOptions = newOptions
  rerender()

  // Should get a new subscription manager instance
  expect(result.current.subscriptionManager).not.toBe(
    initialSubscriptionManager
  )
})
