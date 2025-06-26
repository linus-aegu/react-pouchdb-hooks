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

interface MockAllDocsOptions {
  keys: string[]
  include_docs?: boolean
}

PouchDB.plugin(memory)

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

describe('populateDocuments', () => {
  let db: PouchDB.Database
  let mockContext: {
    pouchdb: PouchDB.Database
    subscriptionManager: MockSubscriptionManager
  }

  beforeEach(async () => {
    db = new PouchDB('test-populate', { adapter: 'memory' })
    mockContext = {
      pouchdb: db,
      subscriptionManager: {
        subscribeToDocs: jest.fn(() => jest.fn()),
        subscribeToView: jest.fn(() => jest.fn()),
        unsubscribeAll: jest.fn(),
      },
    }

    // Setup test data
    await setupTestData()
  })

  afterEach(async () => {
    await db.destroy()
  })

  async function setupTestData() {
    // Create test sites
    await db.put({
      _id: 'site_1',
      type: 'site',
      name: 'Tech Blog',
      domain: 'techblog.com',
    } as TestSite)

    await db.put({
      _id: 'site_2',
      type: 'site',
      name: 'News Site',
      domain: 'news.com',
    } as TestSite)

    // Create test users
    await db.put({
      _id: 'user_1',
      type: 'user',
      name: 'John Doe',
      email: 'john@example.com',
    } as TestUser)

    await db.put({
      _id: 'user_2',
      type: 'user',
      name: 'Jane Smith',
      email: 'jane@example.com',
    } as TestUser)

    // Create test posts
    await db.put({
      _id: 'post_1',
      type: 'post',
      title: 'First Post',
      site_id: 'site_1',
      author_id: 'user_1',
    } as TestPost)

    await db.put({
      _id: 'post_2',
      type: 'post',
      title: 'Second Post',
      site_id: 'site_2',
      author_id: 'user_2',
    } as TestPost)
  }

  describe('Basic Functionality', () => {
    it('should return original documents when no populate config provided', async () => {
      const documents = [
        { _id: 'post_1', _rev: '1-abc', title: 'Test Post' },
      ] as TestPost[]

      const result = await populateDocuments(documents, undefined, mockContext)
      expect(result).toBe(documents)
    })

    it('should return original documents when empty populate config provided', async () => {
      const documents = [
        { _id: 'post_1', _rev: '1-abc', title: 'Test Post' },
      ] as TestPost[]

      const result = await populateDocuments(documents, {}, mockContext)
      expect(result).toEqual(documents)
    })

    it('should populate single reference field', async () => {
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

      expect(result).toHaveLength(1)
      expect(result[0]).toHaveProperty('site')
      expect((result[0] as Record<string, unknown>).site).toMatchObject({
        _id: 'site_1',
        type: 'site',
        name: 'Tech Blog',
        domain: 'techblog.com',
      })
    })

    it('should populate multiple reference fields', async () => {
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
        author_id: { as: 'author' },
      }

      const result = await populateDocuments(
        documents,
        populateConfig,
        mockContext
      )

      expect(result).toHaveLength(1)

      const doc = result[0] as Record<string, unknown>
      expect(doc).toHaveProperty('site')
      expect(doc).toHaveProperty('author')

      expect(doc.site).toMatchObject({
        _id: 'site_1',
        name: 'Tech Blog',
      })

      expect(doc.author).toMatchObject({
        _id: 'user_1',
        name: 'John Doe',
      })
    })

    it('should populate multiple documents', async () => {
      const documents = [
        {
          _id: 'post_1',
          _rev: '1-abc',
          type: 'post',
          title: 'First Post',
          site_id: 'site_1',
          author_id: 'user_1',
        },
        {
          _id: 'post_2',
          _rev: '1-def',
          type: 'post',
          title: 'Second Post',
          site_id: 'site_2',
          author_id: 'user_2',
        },
      ] as TestPost[]

      const populateConfig: PopulateConfig = {
        site_id: { as: 'site' },
        author_id: { as: 'author' },
      }

      const result = await populateDocuments(
        documents,
        populateConfig,
        mockContext
      )

      expect(result).toHaveLength(2)

      const doc1 = result[0] as Record<string, unknown>
      const doc2 = result[1] as Record<string, unknown>

      expect(doc1.site).toMatchObject({ _id: 'site_1', name: 'Tech Blog' })
      expect(doc1.author).toMatchObject({ _id: 'user_1', name: 'John Doe' })

      expect(doc2.site).toMatchObject({ _id: 'site_2', name: 'News Site' })
      expect(doc2.author).toMatchObject({ _id: 'user_2', name: 'Jane Smith' })
    })
  })

  describe('Error Handling', () => {
    it('should handle missing references gracefully', async () => {
      const documents = [
        {
          _id: 'post_1',
          _rev: '1-abc',
          type: 'post',
          title: 'Test Post',
          site_id: 'nonexistent_site',
          author_id: 'user_1',
        },
      ] as TestPost[]

      const populateConfig: PopulateConfig = {
        site_id: { as: 'site' },
        author_id: { as: 'author' },
      }

      const result = await populateDocuments(
        documents,
        populateConfig,
        mockContext
      )

      expect(result).toHaveLength(1)

      const doc = result[0] as Record<string, unknown>
      expect(doc).not.toHaveProperty('site') // Missing reference not populated
      expect(doc).toHaveProperty('author') // Valid reference still populated
    })

    it('should handle database errors gracefully', async () => {
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

      // Mock database error
      const mockErrorContext = {
        pouchdb: {
          allDocs: jest.fn().mockRejectedValue(new Error('Database error')),
        },
        subscriptionManager: mockContext.subscriptionManager,
      }

      const result = await populateDocuments(
        documents,
        populateConfig,
        mockErrorContext as typeof mockContext
      )

      // Should return original documents on error
      expect(result).toEqual(documents)
    })

    it('should handle invalid reference IDs', async () => {
      const documents = [
        {
          _id: 'post_1',
          _rev: '1-abc',
          type: 'post' as const,
          title: 'Test Post',
          site_id: null as unknown as string, // Invalid reference
          author_id: '', // Invalid reference
        },
      ] as TestPost[]

      const populateConfig: PopulateConfig = {
        site_id: { as: 'site' },
        author_id: { as: 'author' },
      }

      const result = await populateDocuments(
        documents,
        populateConfig,
        mockContext
      )

      expect(result).toHaveLength(1)

      const doc = result[0] as Record<string, unknown>
      expect(doc).not.toHaveProperty('site')
      expect(doc).not.toHaveProperty('author')
    })
  })

  describe('Document Type Handling', () => {
    it('should populate any document regardless of type', async () => {
      // Create a document with different type
      await db.put({
        _id: 'site_different_type',
        type: 'different_type',
        name: 'Different Type Site',
      })

      const documents = [
        {
          _id: 'post_1',
          _rev: '1-abc',
          type: 'post',
          title: 'Test Post',
          site_id: 'site_different_type',
          author_id: 'user_1',
        },
      ] as TestPost[]

      const populateConfig: PopulateConfig = {
        site_id: { as: 'site' }, // Should populate regardless of type
        author_id: { as: 'author' },
      }

      const result = await populateDocuments(
        documents,
        populateConfig,
        mockContext
      )

      expect(result).toHaveLength(1)

      const doc = result[0] as Record<string, unknown>
      expect(doc).toHaveProperty('site') // Different type should still be populated
      expect(doc.site).toEqual({
        _id: 'site_different_type',
        _rev: expect.any(String),
        type: 'different_type',
        name: 'Different Type Site',
      })
      expect(doc).toHaveProperty('author') // Normal type populated
    })

    it('should populate documents with any field structure', async () => {
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
        author_id: { as: 'author' },
      }

      const result = await populateDocuments(
        documents,
        populateConfig,
        mockContext
      )

      expect(result).toHaveLength(1)

      const doc = result[0] as Record<string, unknown>
      expect(doc).toHaveProperty('site')
      expect(doc).toHaveProperty('author')
    })
  })

  describe('Bulk Fetching Optimization', () => {
    it('should make single allDocs call for all references', async () => {
      const allDocsSpy = jest.spyOn(db, 'allDocs')

      const documents = [
        {
          _id: 'post_1',
          _rev: '1-abc',
          type: 'post',
          title: 'First Post',
          site_id: 'site_1',
          author_id: 'user_1',
        },
        {
          _id: 'post_2',
          _rev: '1-def',
          type: 'post',
          title: 'Second Post',
          site_id: 'site_2',
          author_id: 'user_2',
        },
      ] as TestPost[]

      const populateConfig: PopulateConfig = {
        site_id: { as: 'site' },
        author_id: { as: 'author' },
      }

      await populateDocuments(documents, populateConfig, mockContext)

      // Should make exactly 1 allDocs call with all reference IDs
      expect(allDocsSpy).toHaveBeenCalledTimes(1)

      // Should include all reference IDs in a single call
      const callArgs = allDocsSpy.mock.calls[0][0]
      expect(callArgs.keys).toEqual(
        expect.arrayContaining(['site_1', 'site_2', 'user_1', 'user_2'])
      )
      expect(callArgs.include_docs).toBe(true)
    })

    it('should deduplicate reference IDs in bulk fetch', async () => {
      const allDocsSpy = jest.spyOn(db, 'allDocs')

      const documents = [
        {
          _id: 'post_1',
          _rev: '1-abc',
          type: 'post',
          title: 'First Post',
          site_id: 'site_1', // Same site
          author_id: 'user_1',
        },
        {
          _id: 'post_2',
          _rev: '1-def',
          type: 'post',
          title: 'Second Post',
          site_id: 'site_1', // Same site (should be deduplicated)
          author_id: 'user_2',
        },
      ] as TestPost[]

      const populateConfig: PopulateConfig = {
        site_id: { as: 'site' },
        author_id: { as: 'author' },
      }

      await populateDocuments(documents, populateConfig, mockContext)

      // Check that site_1 is only fetched once
      const siteCalls = allDocsSpy.mock.calls.filter(call =>
        call[0].keys?.includes('site_1')
      )
      expect(siteCalls).toHaveLength(1)

      // The keys array should contain site_1 only once
      const siteCallKeys = siteCalls[0][0].keys
      const site1Count = siteCallKeys?.filter(key => key === 'site_1').length
      expect(site1Count).toBe(1)
    })
  })

  describe('Development Mode Features', () => {
    it('should log performance information in development mode', async () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'development'

      const consoleSpy = jest.spyOn(console, 'debug').mockImplementation()

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

      await populateDocuments(documents, populateConfig, mockContext)

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Populate \[site_id\] took \d+ms for 1 docs/)
      )

      consoleSpy.mockRestore()
      process.env.NODE_ENV = originalEnv
    })

    it('should log warnings for missing references in development mode', async () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'development'

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

      const documents = [
        {
          _id: 'post_1',
          _rev: '1-abc',
          type: 'post',
          title: 'Test Post',
          site_id: 'nonexistent_site',
          author_id: 'user_1',
        },
      ] as TestPost[]

      const populateConfig: PopulateConfig = {
        site_id: { as: 'site' },
      }

      await populateDocuments(documents, populateConfig, mockContext)

      expect(consoleSpy).toHaveBeenCalledWith(
        'Populate: Reference not found for site_id: nonexistent_site'
      )

      consoleSpy.mockRestore()
      process.env.NODE_ENV = originalEnv
    })
  })
})

describe('Recursive/Nested Populate Tests', () => {
  let mockContext: {
    pouchdb: { allDocs: jest.Mock }
    subscriptionManager: MockSubscriptionManager
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockContext = {
      pouchdb: {
        allDocs: jest.fn(),
      },
      subscriptionManager: {
        subscribeToDocs: jest.fn(() => jest.fn()),
        subscribeToView: jest.fn(() => jest.fn()),
        unsubscribeAll: jest.fn(),
      },
    }
  })

  it('should handle nested populate with two levels', async () => {
    const documents = [
      { _id: 'post_1', _rev: '1-abc', title: 'Post 1', site_id: 'site_1' },
    ]

    const populateConfig = {
      site_id: {
        as: 'site',
        populate: {
          owner_id: { as: 'owner' },
        },
      },
    }

    // Mock site document with owner reference
    const siteDoc = {
      _id: 'site_1',
      _rev: '1-def',
      name: 'Site 1',
      owner_id: 'user_1',
    }
    const ownerDoc = { _id: 'user_1', _rev: '1-ghi', name: 'John Doe' }

    mockContext.pouchdb.allDocs.mockImplementation(
      (options: { keys: string[] }) => {
        if (options.keys.includes('site_1')) {
          return Promise.resolve({
            rows: [{ doc: siteDoc }],
          })
        } else if (options.keys.includes('user_1')) {
          return Promise.resolve({
            rows: [{ doc: ownerDoc }],
          })
        }
        return Promise.resolve({ rows: [] })
      }
    )

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext
    )

    expect(result).toHaveLength(1)
    expect(result[0].site).toEqual({
      _id: 'site_1',
      _rev: '1-def',
      name: 'Site 1',
      owner_id: 'user_1',
      owner: ownerDoc,
    })
  })

  it('should handle nested populate with three levels', async () => {
    const documents = [
      { _id: 'post_1', _rev: '1-abc', title: 'Post 1', site_id: 'site_1' },
    ]

    const populateConfig = {
      site_id: {
        as: 'site',
        populate: {
          owner_id: {
            as: 'owner',
            populate: {
              profile_id: { as: 'profile' },
            },
          },
        },
      },
    }

    const siteDoc = {
      _id: 'site_1',
      _rev: '1-def',
      name: 'Site 1',
      owner_id: 'user_1',
    }
    const ownerDoc = {
      _id: 'user_1',
      _rev: '1-ghi',
      name: 'John Doe',
      profile_id: 'profile_1',
    }
    const profileDoc = { _id: 'profile_1', _rev: '1-jkl', bio: 'Developer' }

    mockContext.pouchdb.allDocs.mockImplementation(
      (options: MockAllDocsOptions) => {
        if (options.keys.includes('site_1')) {
          return Promise.resolve({ rows: [{ doc: siteDoc }] })
        } else if (options.keys.includes('user_1')) {
          return Promise.resolve({ rows: [{ doc: ownerDoc }] })
        } else if (options.keys.includes('profile_1')) {
          return Promise.resolve({ rows: [{ doc: profileDoc }] })
        }
        return Promise.resolve({ rows: [] })
      }
    )

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext
    )

    expect(result).toHaveLength(1)
    expect(result[0].site.owner.profile).toEqual(profileDoc)
  })

  it('should respect maxDepth option and stop recursion', async () => {
    const documents = [
      { _id: 'post_1', _rev: '1-abc', title: 'Post 1', site_id: 'site_1' },
    ]

    const populateConfig = {
      site_id: {
        as: 'site',
        populate: {
          owner_id: {
            as: 'owner',
            populate: {
              profile_id: { as: 'profile' },
            },
          },
        },
      },
    }

    const siteDoc = {
      _id: 'site_1',
      _rev: '1-def',
      name: 'Site 1',
      owner_id: 'user_1',
    }
    const ownerDoc = {
      _id: 'user_1',
      _rev: '1-ghi',
      name: 'John Doe',
      profile_id: 'profile_1',
    }

    mockContext.pouchdb.allDocs.mockImplementation(
      (options: MockAllDocsOptions) => {
        if (options.keys.includes('site_1')) {
          return Promise.resolve({ rows: [{ doc: siteDoc }] })
        } else if (options.keys.includes('user_1')) {
          return Promise.resolve({ rows: [{ doc: ownerDoc }] })
        }
        return Promise.resolve({ rows: [] })
      }
    )

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
      { maxDepth: 2 }
    )

    expect(result).toHaveLength(1)
    expect(result[0].site.owner).toEqual(ownerDoc)
    expect(result[0].site.owner.profile).toBeUndefined() // Should not populate beyond maxDepth
  })

  it('should prevent circular references', async () => {
    const documents = [
      { _id: 'user_1', _rev: '1-abc', name: 'John', friend_id: 'user_2' },
    ]

    const populateConfig = {
      friend_id: {
        as: 'friend',
        populate: {
          friend_id: { as: 'friend' }, // Circular reference
        },
      },
    }

    const user2Doc = {
      _id: 'user_2',
      _rev: '1-def',
      name: 'Jane',
      friend_id: 'user_1',
    }

    mockContext.pouchdb.allDocs.mockImplementation(
      (options: MockAllDocsOptions) => {
        if (options.keys.includes('user_2')) {
          return Promise.resolve({ rows: [{ doc: user2Doc }] })
        } else if (options.keys.includes('user_1')) {
          return Promise.resolve({ rows: [{ doc: documents[0] }] })
        }
        return Promise.resolve({ rows: [] })
      }
    )

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext
    )

    expect(result).toHaveLength(1)
    expect(result[0].friend).toEqual(user2Doc)
    expect(result[0].friend.friend).toBeUndefined() // Should not populate circular reference
  })

  it('should handle multiple nested populates at same level', async () => {
    const documents = [
      {
        _id: 'post_1',
        _rev: '1-abc',
        title: 'Post 1',
        site_id: 'site_1',
        author_id: 'user_1',
      },
    ]

    const populateConfig = {
      site_id: {
        as: 'site',
        populate: {
          owner_id: { as: 'owner' },
        },
      },
      author_id: {
        as: 'author',
        populate: {
          profile_id: { as: 'profile' },
        },
      },
    }

    const siteDoc = {
      _id: 'site_1',
      _rev: '1-def',
      name: 'Site 1',
      owner_id: 'owner_1',
    }
    const authorDoc = {
      _id: 'user_1',
      _rev: '1-ghi',
      name: 'Author',
      profile_id: 'profile_1',
    }
    const ownerDoc = { _id: 'owner_1', _rev: '1-jkl', name: 'Owner' }
    const profileDoc = { _id: 'profile_1', _rev: '1-mno', bio: 'Author bio' }

    mockContext.pouchdb.allDocs.mockImplementation(
      (options: MockAllDocsOptions) => {
        const docs: Array<{ doc: unknown }> = []
        if (options.keys.includes('site_1')) docs.push({ doc: siteDoc })
        if (options.keys.includes('user_1')) docs.push({ doc: authorDoc })
        if (options.keys.includes('owner_1')) docs.push({ doc: ownerDoc })
        if (options.keys.includes('profile_1')) docs.push({ doc: profileDoc })
        return Promise.resolve({ rows: docs })
      }
    )

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext
    )

    expect(result).toHaveLength(1)
    expect(result[0].site.owner).toEqual(ownerDoc)
    expect(result[0].author.profile).toEqual(profileDoc)
  })

  it('should handle missing references in nested populates gracefully', async () => {
    const documents = [
      { _id: 'post_1', _rev: '1-abc', title: 'Post 1', site_id: 'site_1' },
    ]

    const populateConfig = {
      site_id: {
        as: 'site',
        populate: {
          owner_id: { as: 'owner' }, // This reference will be missing
        },
      },
    }

    const siteDoc = {
      _id: 'site_1',
      _rev: '1-def',
      name: 'Site 1',
      owner_id: 'missing_user',
    }

    mockContext.pouchdb.allDocs.mockImplementation(
      (options: MockAllDocsOptions) => {
        if (options.keys.includes('site_1')) {
          return Promise.resolve({ rows: [{ doc: siteDoc }] })
        } else if (options.keys.includes('missing_user')) {
          return Promise.resolve({ rows: [{ error: 'not_found' }] })
        }
        return Promise.resolve({ rows: [] })
      }
    )

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext
    )

    expect(result).toHaveLength(1)
    expect(result[0].site).toEqual(siteDoc) // Site populated but owner missing
    expect(result[0].site.owner).toBeUndefined()
  })

  it('should log depth information in development mode', async () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'

    const logSpy = jest.spyOn(console, 'debug').mockImplementation(jest.fn())

    const documents = [
      { _id: 'post_1', _rev: '1-abc', title: 'Post 1', site_id: 'site_1' },
    ]

    const populateConfig = {
      site_id: {
        as: 'site',
        populate: {
          owner_id: { as: 'owner' },
        },
      },
    }

    const siteDoc = {
      _id: 'site_1',
      _rev: '1-def',
      name: 'Site 1',
      owner_id: 'user_1',
    }
    const ownerDoc = { _id: 'user_1', _rev: '1-ghi', name: 'John Doe' }

    mockContext.pouchdb.allDocs.mockImplementation(
      (options: MockAllDocsOptions) => {
        if (options.keys.includes('site_1')) {
          return Promise.resolve({ rows: [{ doc: siteDoc }] })
        } else if (options.keys.includes('user_1')) {
          return Promise.resolve({ rows: [{ doc: ownerDoc }] })
        }
        return Promise.resolve({ rows: [] })
      }
    )

    await populateDocuments(documents, populateConfig, mockContext)

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(
        /Populate \[owner_id\] took \d+ms for 1 docs \(depth 1\)/
      )
    )
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/Populate \[site_id\] took \d+ms for 1 docs$/)
    )

    logSpy.mockRestore()
    process.env.NODE_ENV = originalEnv
  })
})
