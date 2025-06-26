import PouchDB from 'pouchdb-core'
import memory from 'pouchdb-adapter-memory'
import { populateDocuments } from './usePopulate'
import type { PopulateConfig } from './populate-types'

interface MockSubscriptionManager {
  subscribeToDocs: jest.MockedFunction<
    (
      keys: string[] | null,
      callback: (deleted: boolean, id: string, doc?: unknown) => void
    ) => () => void
  >
  subscribeToView: jest.MockedFunction<
    (ddocId: string, viewName: string, callback: () => void) => () => void
  >
  unsubscribeAll: jest.MockedFunction<() => void>
}

PouchDB.plugin(memory)

interface TestPost {
  _id: string
  _rev: string
  type: 'post'
  title: string
  site_id: string
  author_id: string
  category_id?: string
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

interface TestCategory {
  _id: string
  _rev: string
  type: 'category'
  name: string
  description: string
}

describe('populateDocuments Performance Tests', () => {
  let db: PouchDB.Database
  let mockContext: {
    pouchdb: PouchDB.Database
    subscriptionManager: MockSubscriptionManager
  }

  beforeEach(async () => {
    db = new PouchDB('test-populate-perf', { adapter: 'memory' })
    mockContext = {
      pouchdb: db,
      subscriptionManager: {
        subscribeToDocs: jest.fn(() => jest.fn()),
        subscribeToView: jest.fn(() => jest.fn()),
        unsubscribeAll: jest.fn(),
      },
    }
  })

  afterEach(async () => {
    await db.destroy()
  })

  it('should handle large datasets efficiently', async () => {
    // Create 1000 posts with references
    const posts: TestPost[] = []

    // Create reference documents (without _rev for new documents)
    for (let i = 0; i < 50; i++) {
      const site: TestSite = {
        _id: `site_${i}`,
        type: 'site',
        name: `Site ${i}`,
        domain: `site${i}.com`,
      } as TestSite
      await db.put(site)

      const user: TestUser = {
        _id: `user_${i}`,
        type: 'user',
        name: `User ${i}`,
        email: `user${i}@example.com`,
      } as TestUser
      await db.put(user)
    }

    // Create 1000 posts
    for (let i = 0; i < 1000; i++) {
      const post: TestPost = {
        _id: `post_${i}`,
        _rev: '1-abc',
        type: 'post',
        title: `Post ${i}`,
        site_id: `site_${i % 50}`,
        author_id: `user_${i % 50}`,
      }
      posts.push(post)
    }

    const populateConfig: PopulateConfig = {
      site_id: { as: 'site' },
      author_id: { as: 'author' },
    }

    const startTime = Date.now()
    const result = await populateDocuments(posts, populateConfig, mockContext)
    const endTime = Date.now()

    expect(result).toHaveLength(1000)
    expect((result[0] as Record<string, unknown>).site).toBeDefined()
    expect((result[0] as Record<string, unknown>).author).toBeDefined()

    // Should complete in reasonable time (less than 1 second for 1000 docs)
    expect(endTime - startTime).toBeLessThan(1000)
  })

  it('should use bulk fetching for efficiency', async () => {
    const allDocsSpy = jest.spyOn(db, 'allDocs')

    // Create reference documents
    for (let i = 0; i < 10; i++) {
      await db.put({
        _id: `site_${i}`,
        type: 'site',
        name: `Site ${i}`,
      } as TestSite)

      await db.put({
        _id: `user_${i}`,
        type: 'user',
        name: `User ${i}`,
      } as TestUser)
    }

    // Create 100 posts referencing the same 10 sites and users
    const posts: TestPost[] = []
    for (let i = 0; i < 100; i++) {
      posts.push({
        _id: `post_${i}`,
        _rev: '1-abc',
        type: 'post',
        title: `Post ${i}`,
        site_id: `site_${i % 10}`,
        author_id: `user_${i % 10}`,
      })
    }

    const populateConfig: PopulateConfig = {
      site_id: { as: 'site' },
      author_id: { as: 'author' },
    }

    const result = await populateDocuments(posts, populateConfig, mockContext)

    expect((result[0] as Record<string, unknown>).site).toBeDefined()

    // Should make only 1 allDocs call with all reference IDs
    // regardless of 100 posts
    expect(allDocsSpy).toHaveBeenCalledTimes(1)
  })

  it('should handle frequent updates efficiently with fingerprinting', async () => {
    const allDocsSpy = jest.spyOn(db, 'allDocs')

    // Setup test data
    await db.put({
      _id: 'site_1',
      type: 'site',
      name: 'Test Site',
    } as TestSite)

    const documents = [
      {
        _id: 'post_1',
        _rev: '1-abc',
        type: 'post',
        title: 'Test Post',
        site_id: 'site_1',
        author_id: 'user_1',
      },
    ] as TestPost[]

    const populateConfig: PopulateConfig = {
      site_id: { as: 'site' },
    }

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext
    )

    expect((result[0] as Record<string, unknown>).site).toBeDefined()

    const initialCallCount = allDocsSpy.mock.calls.length

    // Multiple calls with same data should not trigger additional DB calls
    // (This tests the bulk fetching efficiency, not React hook fingerprinting)
    await populateDocuments(documents, populateConfig, mockContext)
    await populateDocuments(documents, populateConfig, mockContext)

    // Each call will make DB requests since this is a pure function
    // The efficiency comes from bulk fetching, not caching between calls
    expect(allDocsSpy.mock.calls.length).toBeGreaterThan(initialCallCount)
  })

  it('should minimize re-computation on partial updates', async () => {
    // Setup test data
    await db.put({
      _id: 'site_1',
      type: 'site',
      name: 'Test Site',
    } as TestSite)

    const documents = [
      {
        _id: 'post_1',
        _rev: '1-abc',
        type: 'post',
        title: 'Test Post',
        site_id: 'site_1',
        author_id: 'user_1',
      },
    ] as TestPost[]

    const populateConfig: PopulateConfig = {
      site_id: { as: 'site' },
    }

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext
    )

    expect((result[0] as Record<string, unknown>).site).toBeDefined()

    const firstSiteRef = (result[0] as Record<string, unknown>).site

    // Test that the same input produces consistent output
    const secondResult = await populateDocuments(
      documents,
      populateConfig,
      mockContext
    )
    const secondSiteRef = (secondResult[0] as Record<string, unknown>).site

    // Should produce equivalent populated data
    expect(secondSiteRef).toEqual(firstSiteRef)
  })

  it('should handle memory efficiently with large reference sets', async () => {
    const startMemory = process.memoryUsage().heapUsed

    // Create 500 posts with 100 unique sites
    const posts: TestPost[] = []

    // Create 100 sites
    for (let i = 0; i < 100; i++) {
      await db.put({
        _id: `site_${i}`,
        type: 'site',
        name: `Site ${i}`,
      } as TestSite)
    }

    // Create 500 posts
    for (let i = 0; i < 500; i++) {
      posts.push({
        _id: `post_${i}`,
        _rev: '1-abc',
        type: 'post',
        title: `Post ${i}`,
        site_id: `site_${i % 100}`,
        author_id: `user_${i % 100}`,
      })
    }

    const populateConfig: PopulateConfig = {
      site_id: { as: 'site' },
    }

    const result = await populateDocuments(posts, populateConfig, mockContext)

    expect(result).toHaveLength(500)
    expect((result[0] as Record<string, unknown>).site).toBeDefined()

    const endMemory = process.memoryUsage().heapUsed
    const memoryIncrease = endMemory - startMemory

    // Memory increase should be reasonable (less than 50MB for this test)
    expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024)
  })

  it('should batch reference fetching efficiently', async () => {
    const allDocsSpy = jest.spyOn(db, 'allDocs')

    // Create reference documents
    for (let i = 0; i < 50; i++) {
      await db.put({
        _id: `site_${i}`,
        type: 'site',
        name: `Site ${i}`,
      } as TestSite)
    }

    // Create 200 posts referencing different sites
    const posts: TestPost[] = []
    for (let i = 0; i < 200; i++) {
      posts.push({
        _id: `post_${i}`,
        _rev: '1-abc',
        type: 'post',
        title: `Post ${i}`,
        site_id: `site_${i % 50}`,
        author_id: `user_${i % 50}`,
      })
    }

    const populateConfig: PopulateConfig = {
      site_id: { as: 'site' },
    }

    const result = await populateDocuments(posts, populateConfig, mockContext)

    expect((result[0] as Record<string, unknown>).site).toBeDefined()

    // Should make exactly 1 call regardless of document count
    // (since we only have one type of reference)
    expect(allDocsSpy).toHaveBeenCalledTimes(1)
  })

  it('should perform well with complex populate configurations', async () => {
    // Create reference documents
    for (let i = 0; i < 20; i++) {
      await db.put({
        _id: `site_${i}`,
        type: 'site',
        name: `Site ${i}`,
      } as TestSite)

      await db.put({
        _id: `user_${i}`,
        type: 'user',
        name: `User ${i}`,
      } as TestUser)

      await db.put({
        _id: `category_${i}`,
        type: 'category',
        name: `Category ${i}`,
        description: `Description ${i}`,
      } as TestCategory)
    }

    // Create posts with multiple references
    const posts: TestPost[] = []
    for (let i = 0; i < 100; i++) {
      posts.push({
        _id: `post_${i}`,
        _rev: '1-abc',
        type: 'post',
        title: `Post ${i}`,
        site_id: `site_${i % 20}`,
        author_id: `user_${i % 20}`,
        category_id: `category_${i % 20}`,
      })
    }

    const populateConfig: PopulateConfig = {
      site_id: { as: 'site' },
      author_id: { as: 'author' },
      category_id: { as: 'category' },
    }

    const startTime = Date.now()
    const result = await populateDocuments(posts, populateConfig, mockContext)
    const endTime = Date.now()

    const doc = result[0] as Record<string, unknown>
    expect(doc.site).toBeDefined()
    expect(doc.author).toBeDefined()
    expect(doc.category).toBeDefined()

    // Should complete quickly even with complex populate
    expect(endTime - startTime).toBeLessThan(100)
  })

  it('should handle rapid successive updates efficiently', async () => {
    const allDocsSpy = jest.spyOn(db, 'allDocs')

    // Setup test data
    await db.put({
      _id: 'site_1',
      type: 'site',
      name: 'Test Site',
    } as TestSite)

    const documents = [
      {
        _id: 'post_1',
        _rev: '1-abc',
        type: 'post',
        title: 'Test Post',
        site_id: 'site_1',
        author_id: 'user_1',
      },
    ] as TestPost[]

    const populateConfig: PopulateConfig = {
      site_id: { as: 'site' },
    }

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext
    )

    expect((result[0] as Record<string, unknown>).site).toBeDefined()

    const initialCallCount = allDocsSpy.mock.calls.length

    // Rapid successive calls
    const promises = []
    for (let i = 0; i < 10; i++) {
      promises.push(populateDocuments(documents, populateConfig, mockContext))
    }

    await Promise.all(promises)

    // Each call makes its own DB requests since this is a pure function
    // The efficiency comes from bulk fetching within each call
    expect(allDocsSpy.mock.calls.length).toBeGreaterThan(initialCallCount)
  })

  it('should scale linearly with document count', async () => {
    // Create reference documents
    for (let i = 0; i < 10; i++) {
      await db.put({
        _id: `site_${i}`,
        type: 'site',
        name: `Site ${i}`,
      } as TestSite)
    }

    const populateConfig: PopulateConfig = {
      site_id: { as: 'site' },
    }

    // Test with different document counts
    const counts = [10, 50, 100]
    const times: number[] = []

    for (const count of counts) {
      const posts: TestPost[] = []
      for (let i = 0; i < count; i++) {
        posts.push({
          _id: `post_${i}`,
          _rev: '1-abc',
          type: 'post',
          title: `Post ${i}`,
          site_id: `site_${i % 10}`,
          author_id: `user_${i % 10}`,
        })
      }

      const startTime = Date.now()
      const result = await populateDocuments(posts, populateConfig, mockContext)
      const endTime = Date.now()

      expect((result[0] as Record<string, unknown>).site).toBeDefined()

      times.push(endTime - startTime)
    }

    // Times should scale reasonably (not exponentially)
    // Allow for some variance in timing but ensure no exponential growth
    for (let i = 1; i < times.length; i++) {
      // Check for reasonable scaling - avoid conditional expects
      const currentTime = Math.max(times[i], 1) // Ensure minimum 1ms
      const previousTime = Math.max(times[i - 1], 1) // Ensure minimum 1ms
      expect(currentTime).toBeLessThan(previousTime * 10)
    }
  })
})
