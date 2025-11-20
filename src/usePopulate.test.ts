import PouchDB from 'pouchdb-core'
import memory from 'pouchdb-adapter-memory'
import { populateDocuments } from './usePopulate'
import type { PopulateConfig } from './populate-types'

interface MockSubscriptionManager {
  subscribeToDocs: jest.MockedFunction<
    (
      keys: string[] | null,
      callback: (deleted: boolean, id: string, doc?: unknown) => void,
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
  bio?: string
  address?: {
    city: string
    country: string
  }
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
      bio: 'Software developer passionate about React and PouchDB',
      address: {
        city: 'San Francisco',
        country: 'USA',
      },
    } as TestUser)

    await db.put({
      _id: 'user_2',
      type: 'user',
      name: 'Jane Smith',
      email: 'jane@example.com',
      bio: 'Technical writer and UX designer',
      address: {
        city: 'London',
        country: 'UK',
      },
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
        mockContext,
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
        mockContext,
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
        mockContext,
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
        mockContext,
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
        mockErrorContext as typeof mockContext,
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
        mockContext,
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
        mockContext,
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
        mockContext,
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
        expect.arrayContaining(['site_1', 'site_2', 'user_1', 'user_2']),
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
        call[0].keys?.includes('site_1'),
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
        expect.stringMatching(/Populate \[site_id\] took \d+ms for 1 docs,/),
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
        'Populate: Reference not found for site_id: nonexistent_site',
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
      },
    )

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
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
      },
    )

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
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
      },
    )

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
      { maxDepth: 2 },
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
      },
    )

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
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
      },
    )

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
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
      },
    )

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
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
      },
    )

    await populateDocuments(documents, populateConfig, mockContext)

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(
        /Populate \[owner_id\] took \d+ms for 1 docs \(depth 1\/3\)/,
      ),
    )
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/Populate \[site_id\] took \d+ms for 1 docs,/),
    )

    logSpy.mockRestore()
    process.env.NODE_ENV = originalEnv
  })
})

describe('Nested Field Path Population', () => {
  let db: PouchDB.Database
  let mockContext: {
    pouchdb: PouchDB.Database
    subscriptionManager: MockSubscriptionManager
  }

  beforeEach(async () => {
    db = new PouchDB('test-nested-populate', { adapter: 'memory' })
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

  it('should populate nested source field to flat target', async () => {
    await db.put({
      _id: 'cultivar_1',
      type: 'cultivar',
      name: 'Pink Mandevilla',
      color: 'pink',
    })

    const documents = [
      {
        _id: 'order_1',
        _rev: '1-abc',
        type: 'order',
        material_info: {
          cultivar_id: 'cultivar_1',
          quantity: 100,
        },
      },
    ]

    const populateConfig: PopulateConfig = {
      'material_info.cultivar_id': { as: 'cultivar' },
    }

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
    )

    expect(result).toHaveLength(1)
    expect((result[0] as any).cultivar).toMatchObject({
      _id: 'cultivar_1',
      name: 'Pink Mandevilla',
      color: 'pink',
    })
    // Original structure should remain unchanged
    expect((result[0] as any).material_info.cultivar_id).toBe('cultivar_1')
  })

  it('should populate nested source to nested target', async () => {
    await db.put({
      _id: 'cultivar_1',
      type: 'cultivar',
      name: 'Pink Mandevilla',
      color: 'pink',
      size: 'medium',
    })

    const documents = [
      {
        _id: 'order_1',
        _rev: '1-abc',
        type: 'order',
        customer: 'Garden Center ABC',
        material_info: {
          cultivar_id: 'cultivar_1',
          quantity: 100,
          pot_size: '6 inch',
        },
      },
    ]

    const populateConfig: PopulateConfig = {
      'material_info.cultivar_id': { as: 'material_info.cultivar' },
    }

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
    )

    expect(result).toHaveLength(1)
    const order = result[0] as any

    // Original fields should be preserved
    expect(order.material_info.cultivar_id).toBe('cultivar_1')
    expect(order.material_info.quantity).toBe(100)
    expect(order.material_info.pot_size).toBe('6 inch')

    // Populated data should be at nested location
    expect(order.material_info.cultivar).toMatchObject({
      _id: 'cultivar_1',
      type: 'cultivar',
      name: 'Pink Mandevilla',
      color: 'pink',
      size: 'medium',
    })
  })

  it('should handle the material_info.cultivar_id example from requirements', async () => {
    // Create cultivar document
    await db.put({
      _id: '4A',
      type: 'cultivar',
      name: 'Mandevilla hybrid',
      color: 'pink',
      size: 'large',
    })

    // Create order with nested cultivar reference
    const documents = [
      {
        _id: 'order_123',
        _rev: '1-abc',
        type: 'order',
        material_info: {
          cultivar_id: '4A',
        },
      },
    ]

    const populateConfig: PopulateConfig = {
      'material_info.cultivar_id': { as: 'cultivar' },
    }

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
    )

    // Should result in order.cultivar = { _id: "4A", name: "Mandevilla hybrid", ... }
    expect(result).toHaveLength(1)
    expect((result[0] as any).cultivar).toMatchObject({
      _id: '4A',
      name: 'Mandevilla hybrid',
      color: 'pink',
      size: 'large',
    })
  })

  it('should handle deeply nested paths', async () => {
    await db.put({
      _id: 'vendor_1',
      type: 'vendor',
      name: 'Acme Supplies',
      contact: 'John Doe',
    })

    const documents = [
      {
        _id: 'order_1',
        _rev: '1-abc',
        details: {
          shipping: {
            vendor_id: 'vendor_1',
            method: 'ground',
          },
        },
      },
    ]

    const populateConfig: PopulateConfig = {
      'details.shipping.vendor_id': { as: 'details.shipping.vendor' },
    }

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
    )

    expect(result).toHaveLength(1)
    const order = result[0] as any
    expect(order.details.shipping.vendor).toMatchObject({
      _id: 'vendor_1',
      name: 'Acme Supplies',
      contact: 'John Doe',
    })
    // Original fields preserved
    expect(order.details.shipping.vendor_id).toBe('vendor_1')
    expect(order.details.shipping.method).toBe('ground')
  })

  it('should create intermediate objects when needed for target path', async () => {
    await db.put({
      _id: 'user_1',
      type: 'user',
      name: 'John',
      email: 'john@example.com',
    })

    const documents = [
      {
        _id: 'doc_1',
        _rev: '1-abc',
        user_id: 'user_1',
      },
    ]

    const populateConfig: PopulateConfig = {
      user_id: { as: 'metadata.populated.user' },
    }

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
    )

    expect(result).toHaveLength(1)
    const doc = result[0] as any

    // Should create metadata and populated objects
    expect(doc.metadata).toBeDefined()
    expect(doc.metadata.populated).toBeDefined()
    expect(doc.metadata.populated.user).toMatchObject({
      _id: 'user_1',
      name: 'John',
      email: 'john@example.com',
    })
  })

  it('should handle missing intermediate objects gracefully', async () => {
    const documents = [
      {
        _id: 'doc_1',
        _rev: '1-abc',
        // material_info doesn't exist
      },
    ]

    const populateConfig: PopulateConfig = {
      'material_info.cultivar_id': { as: 'cultivar' },
    }

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
    )

    // Should not crash, just skip population
    expect(result).toHaveLength(1)
    expect(result[0]).not.toHaveProperty('cultivar')
  })

  it('should handle null intermediate objects gracefully', async () => {
    const documents = [
      {
        _id: 'doc_1',
        _rev: '1-abc',
        material_info: null as any,
      },
    ]

    const populateConfig: PopulateConfig = {
      'material_info.cultivar_id': { as: 'cultivar' },
    }

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
    )

    // Should not crash, just skip population
    expect(result).toHaveLength(1)
    expect(result[0]).not.toHaveProperty('cultivar')
  })

  it('should work with mixed flat and nested paths', async () => {
    await db.put({
      _id: 'site_1',
      type: 'site',
      name: 'Main Site',
    })

    await db.put({
      _id: 'cultivar_1',
      type: 'cultivar',
      name: 'Pink Rose',
    })

    const documents = [
      {
        _id: 'order_1',
        _rev: '1-abc',
        site_id: 'site_1',
        material_info: {
          cultivar_id: 'cultivar_1',
        },
      },
    ]

    const populateConfig: PopulateConfig = {
      site_id: { as: 'site' },
      'material_info.cultivar_id': { as: 'material_info.cultivar' },
    }

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
    )

    expect(result).toHaveLength(1)
    const order = result[0] as any

    // Flat path population
    expect(order.site).toMatchObject({
      _id: 'site_1',
      name: 'Main Site',
    })

    // Nested path population
    expect(order.material_info.cultivar).toMatchObject({
      _id: 'cultivar_1',
      name: 'Pink Rose',
    })
  })

  it('should support multiple nested fields in same parent object', async () => {
    await db.put({
      _id: 'cultivar_1',
      type: 'cultivar',
      name: 'Red Rose',
    })

    await db.put({
      _id: 'supplier_1',
      type: 'supplier',
      name: 'Green Thumb Supplies',
    })

    const documents = [
      {
        _id: 'order_1',
        _rev: '1-abc',
        material_info: {
          cultivar_id: 'cultivar_1',
          supplier_id: 'supplier_1',
          quantity: 50,
        },
      },
    ]

    const populateConfig: PopulateConfig = {
      'material_info.cultivar_id': { as: 'material_info.cultivar' },
      'material_info.supplier_id': { as: 'material_info.supplier' },
    }

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
    )

    expect(result).toHaveLength(1)
    const order = result[0] as any

    // Both nested fields should be populated
    expect(order.material_info.cultivar).toMatchObject({
      _id: 'cultivar_1',
      name: 'Red Rose',
    })
    expect(order.material_info.supplier).toMatchObject({
      _id: 'supplier_1',
      name: 'Green Thumb Supplies',
    })

    // Original fields preserved
    expect(order.material_info.quantity).toBe(50)
    expect(order.material_info.cultivar_id).toBe('cultivar_1')
    expect(order.material_info.supplier_id).toBe('supplier_1')
  })

  it('should handle nested populate with nested paths', async () => {
    // Create nested documents
    await db.put({
      _id: 'country_1',
      type: 'country',
      name: 'USA',
    })

    await db.put({
      _id: 'supplier_1',
      type: 'supplier',
      name: 'Green Supplies',
      location: {
        country_id: 'country_1',
      },
    })

    const documents = [
      {
        _id: 'order_1',
        _rev: '1-abc',
        material_info: {
          supplier_id: 'supplier_1',
        },
      },
    ]

    const populateConfig: PopulateConfig = {
      'material_info.supplier_id': {
        as: 'material_info.supplier',
        populate: {
          'location.country_id': { as: 'location.country' },
        },
      },
    }

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
    )

    expect(result).toHaveLength(1)
    const order = result[0] as any

    // Check nested populated structure
    expect(order.material_info.supplier.name).toBe('Green Supplies')
    expect(order.material_info.supplier.location.country).toMatchObject({
      _id: 'country_1',
      name: 'USA',
    })
  })

  it('should handle empty string as reference ID', async () => {
    const documents = [
      {
        _id: 'doc_1',
        _rev: '1-abc',
        material_info: {
          cultivar_id: '',
        },
      },
    ]

    const populateConfig: PopulateConfig = {
      'material_info.cultivar_id': { as: 'cultivar' },
    }

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
    )

    expect(result).toHaveLength(1)
    expect(result[0]).not.toHaveProperty('cultivar')
  })

  it('should handle non-string reference values', async () => {
    const documents = [
      {
        _id: 'doc_1',
        _rev: '1-abc',
        material_info: {
          cultivar_id: 123 as any, // number instead of string
        },
      },
    ]

    const populateConfig: PopulateConfig = {
      'material_info.cultivar_id': { as: 'cultivar' },
    }

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
    )

    expect(result).toHaveLength(1)
    expect(result[0]).not.toHaveProperty('cultivar')
  })

  it('should preserve document structure when populating to sibling paths', async () => {
    await db.put({
      _id: 'cultivar_1',
      type: 'cultivar',
      name: 'Blue Orchid',
    })

    const documents = [
      {
        _id: 'order_1',
        _rev: '1-abc',
        material_info: {
          cultivar_id: 'cultivar_1',
          existing_field: 'should remain',
          nested: {
            data: 'preserved',
          },
        },
      },
    ]

    const populateConfig: PopulateConfig = {
      'material_info.cultivar_id': { as: 'material_info.cultivar_details' },
    }

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
    )

    const order = result[0] as any

    // New field added
    expect(order.material_info.cultivar_details).toMatchObject({
      _id: 'cultivar_1',
      name: 'Blue Orchid',
    })

    // All original fields preserved
    expect(order.material_info.cultivar_id).toBe('cultivar_1')
    expect(order.material_info.existing_field).toBe('should remain')
    expect(order.material_info.nested.data).toBe('preserved')
  })
})

describe('Field Selection Functionality', () => {
  let db: PouchDB.Database
  let mockContext: {
    pouchdb: PouchDB.Database
    subscriptionManager: MockSubscriptionManager
  }

  beforeEach(async () => {
    db = new PouchDB('test-field-selection', { adapter: 'memory' })
    mockContext = {
      pouchdb: db,
      subscriptionManager: {
        subscribeToDocs: jest.fn(() => jest.fn()),
        subscribeToView: jest.fn(() => jest.fn()),
        unsubscribeAll: jest.fn(),
      },
    }

    // Setup test data with rich user documents
    await db.put({
      _id: 'user_1',
      type: 'user',
      name: 'John Doe',
      email: 'john@example.com',
      bio: 'Software developer passionate about React and PouchDB',
      address: {
        city: 'San Francisco',
        country: 'USA',
        zipCode: '94102',
      },
      preferences: {
        theme: 'dark',
        notifications: true,
      },
      age: 30,
      salary: 120000,
      ssn: '123-45-6789',
    } as TestUser)

    await db.put({
      _id: 'user_2',
      type: 'user',
      name: 'Jane Smith',
      email: 'jane@example.com',
      bio: 'Technical writer and UX designer',
      address: {
        city: 'London',
        country: 'UK',
        zipCode: 'SW1A 1AA',
      },
      preferences: {
        theme: 'light',
        notifications: false,
      },
      age: 28,
      salary: 95000,
      ssn: '987-65-4321',
    } as TestUser)
  })

  afterEach(async () => {
    await db.destroy()
  })

  it('should include only specified fields when fields array is provided', async () => {
    const documents = [
      {
        _id: 'post_1',
        _rev: '1-abc',
        type: 'post',
        title: 'Test Post',
        author_id: 'user_1',
      },
    ] as TestPost[]

    const populateConfig: PopulateConfig = {
      author_id: {
        as: 'author',
        fields: ['name', 'email'],
      },
    }

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
    )

    expect(result).toHaveLength(1)
    const post = result[0] as any

    // Should include specified fields plus _id and _rev
    expect(post.author).toEqual({
      _id: 'user_1',
      _rev: expect.any(String),
      name: 'John Doe',
      email: 'john@example.com',
    })

    // Should not include other fields
    expect(post.author).not.toHaveProperty('bio')
    expect(post.author).not.toHaveProperty('age')
    expect(post.author).not.toHaveProperty('salary')
    expect(post.author).not.toHaveProperty('ssn')
    expect(post.author).not.toHaveProperty('address')
    expect(post.author).not.toHaveProperty('preferences')
  })

  it('should include nested fields using dot notation', async () => {
    const documents = [
      {
        _id: 'post_1',
        _rev: '1-abc',
        type: 'post',
        title: 'Test Post',
        author_id: 'user_1',
      },
    ] as TestPost[]

    const populateConfig: PopulateConfig = {
      author_id: {
        as: 'author',
        fields: ['name', 'address.city', 'address.country'],
      },
    }

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
    )

    expect(result).toHaveLength(1)
    const post = result[0] as any

    // Should include specified fields with nested structure
    expect(post.author).toEqual({
      _id: 'user_1',
      _rev: expect.any(String),
      name: 'John Doe',
      address: {
        city: 'San Francisco',
        country: 'USA',
      },
    })

    // Should not include other nested fields or top-level fields
    expect(post.author.address).not.toHaveProperty('zipCode')
    expect(post.author).not.toHaveProperty('email')
    expect(post.author).not.toHaveProperty('preferences')
  })

  it('should include entire document when no fields specified', async () => {
    const documents = [
      {
        _id: 'post_1',
        _rev: '1-abc',
        type: 'post',
        title: 'Test Post',
        author_id: 'user_1',
      },
    ] as TestPost[]

    const populateConfig: PopulateConfig = {
      author_id: {
        as: 'author',
        // No fields specified - should include entire document
      },
    }

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
    )

    expect(result).toHaveLength(1)
    const post = result[0] as any

    // Should include all fields
    expect(post.author).toMatchObject({
      _id: 'user_1',
      name: 'John Doe',
      email: 'john@example.com',
      bio: 'Software developer passionate about React and PouchDB',
      age: 30,
      salary: 120000,
      ssn: '123-45-6789',
      address: {
        city: 'San Francisco',
        country: 'USA',
        zipCode: '94102',
      },
      preferences: {
        theme: 'dark',
        notifications: true,
      },
    })
  })

  it('should include entire document when fields array is empty', async () => {
    const documents = [
      {
        _id: 'post_1',
        _rev: '1-abc',
        type: 'post',
        title: 'Test Post',
        author_id: 'user_1',
      },
    ] as TestPost[]

    const populateConfig: PopulateConfig = {
      author_id: {
        as: 'author',
        fields: [], // Empty array - should include entire document
      },
    }

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
    )

    expect(result).toHaveLength(1)
    const post = result[0] as any

    // Should include all fields
    expect(post.author).toMatchObject({
      _id: 'user_1',
      name: 'John Doe',
      email: 'john@example.com',
      bio: 'Software developer passionate about React and PouchDB',
    })
  })

  it('should handle field selection with multiple populated references', async () => {
    await db.put({
      _id: 'site_1',
      type: 'site',
      name: 'Tech Blog',
      domain: 'techblog.com',
      description: 'A blog about technology',
      founded: '2020',
      traffic: 1000000,
      secret_key: 'top-secret',
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
      site_id: {
        as: 'site',
        fields: ['name', 'domain'],
      },
      author_id: {
        as: 'author',
        fields: ['name', 'email'],
      },
    }

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
    )

    expect(result).toHaveLength(1)
    const post = result[0] as any

    // Site should only have specified fields
    expect(post.site).toEqual({
      _id: 'site_1',
      _rev: expect.any(String),
      name: 'Tech Blog',
      domain: 'techblog.com',
    })

    // Author should only have specified fields
    expect(post.author).toEqual({
      _id: 'user_1',
      _rev: expect.any(String),
      name: 'John Doe',
      email: 'john@example.com',
    })

    // Should not include sensitive or unspecified fields
    expect(post.site).not.toHaveProperty('secret_key')
    expect(post.site).not.toHaveProperty('traffic')
    expect(post.author).not.toHaveProperty('salary')
    expect(post.author).not.toHaveProperty('ssn')
  })

  it('should handle field selection with nested populate', async () => {
    // Create company document
    await db.put({
      _id: 'company_1',
      type: 'company',
      name: 'Tech Corp',
      industry: 'Technology',
      revenue: 5000000,
      employees: 100,
      internal_id: 'INTERNAL_123',
      address: {
        city: 'Seattle',
        state: 'WA',
        country: 'USA',
      },
    })

    // Update user to include company reference
    const existingUser = await db.get('user_1')
    await db.put({
      ...existingUser,
      company_id: 'company_1',
    } as TestUser)

    const documents = [
      {
        _id: 'post_1',
        _rev: '1-abc',
        type: 'post',
        title: 'Test Post',
        author_id: 'user_1',
      },
    ] as TestPost[]

    const populateConfig: PopulateConfig = {
      author_id: {
        as: 'author',
        fields: ['name', 'email'],
        populate: {
          company_id: {
            as: 'company',
            fields: ['name', 'industry', 'address.city'],
          },
        },
      },
    }

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
    )

    expect(result).toHaveLength(1)
    const post = result[0] as any

    // Author should only have specified fields
    expect(post.author).toEqual({
      _id: 'user_1',
      _rev: expect.any(String),
      name: 'John Doe',
      email: 'john@example.com',
      company: {
        _id: 'company_1',
        _rev: expect.any(String),
        name: 'Tech Corp',
        industry: 'Technology',
        address: {
          city: 'Seattle',
        },
      },
    })

    // Should not include sensitive company data
    expect(post.author.company).not.toHaveProperty('revenue')
    expect(post.author.company).not.toHaveProperty('internal_id')
    expect(post.author.company.address).not.toHaveProperty('state')
    expect(post.author.company.address).not.toHaveProperty('country')

    // Should not include sensitive user data
    expect(post.author).not.toHaveProperty('salary')
    expect(post.author).not.toHaveProperty('ssn')
  })

  it('should handle missing fields gracefully', async () => {
    const documents = [
      {
        _id: 'post_1',
        _rev: '1-abc',
        type: 'post',
        title: 'Test Post',
        author_id: 'user_1',
      },
    ] as TestPost[]

    const populateConfig: PopulateConfig = {
      author_id: {
        as: 'author',
        fields: ['name', 'nonexistent_field', 'address.nonexistent_nested'],
      },
    }

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
    )

    expect(result).toHaveLength(1)
    const post = result[0] as any

    // Should only include existing fields
    expect(post.author).toEqual({
      _id: 'user_1',
      _rev: expect.any(String),
      name: 'John Doe',
    })

    // Should not include undefined fields
    expect(post.author).not.toHaveProperty('nonexistent_field')
    expect(post.author).not.toHaveProperty('address')
  })

  it('should preserve _id and _rev even when not in fields array', async () => {
    const documents = [
      {
        _id: 'post_1',
        _rev: '1-abc',
        type: 'post',
        title: 'Test Post',
        author_id: 'user_1',
      },
    ] as TestPost[]

    const populateConfig: PopulateConfig = {
      author_id: {
        as: 'author',
        fields: ['name'], // Only name, but _id and _rev should still be included
      },
    }

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
    )

    expect(result).toHaveLength(1)
    const post = result[0] as any

    // Should always include _id and _rev for document integrity
    expect(post.author).toEqual({
      _id: 'user_1',
      _rev: expect.any(String),
      name: 'John Doe',
    })

    expect(post.author._id).toBe('user_1')
    expect(post.author._rev).toBeTruthy()
  })

  it('should handle field selection in bulk operations efficiently', async () => {
    const allDocsSpy = jest.spyOn(db, 'allDocs')

    const documents = [
      {
        _id: 'post_1',
        _rev: '1-abc',
        type: 'post',
        title: 'First Post',
        author_id: 'user_1',
      },
      {
        _id: 'post_2',
        _rev: '1-def',
        type: 'post',
        title: 'Second Post',
        author_id: 'user_2',
      },
    ] as TestPost[]

    const populateConfig: PopulateConfig = {
      author_id: {
        as: 'author',
        fields: ['name', 'email'],
      },
    }

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
    )

    // Should still use bulk fetching
    expect(allDocsSpy).toHaveBeenCalledTimes(1)
    expect(allDocsSpy.mock.calls[0][0].keys).toEqual(
      expect.arrayContaining(['user_1', 'user_2']),
    )

    // Both authors should have field filtering applied
    expect(result).toHaveLength(2)
    expect(result[0].author).toEqual({
      _id: 'user_1',
      _rev: expect.any(String),
      name: 'John Doe',
      email: 'john@example.com',
    })
    expect(result[1].author).toEqual({
      _id: 'user_2',
      _rev: expect.any(String),
      name: 'Jane Smith',
      email: 'jane@example.com',
    })

    // Neither should have sensitive data
    expect(result[0].author).not.toHaveProperty('salary')
    expect(result[1].author).not.toHaveProperty('ssn')
  })

  it('should work with deeply nested field paths', async () => {
    await db.put({
      _id: 'user_complex',
      type: 'user',
      name: 'Complex User',
      profile: {
        personal: {
          details: {
            birthplace: 'New York',
            education: {
              university: 'MIT',
              degree: 'Computer Science',
            },
          },
        },
        work: {
          experience: {
            current: {
              position: 'Senior Developer',
              salary: 150000,
            },
          },
        },
      },
    })

    const documents = [
      {
        _id: 'post_1',
        _rev: '1-abc',
        type: 'post',
        title: 'Test Post',
        author_id: 'user_complex',
      },
    ] as TestPost[]

    const populateConfig: PopulateConfig = {
      author_id: {
        as: 'author',
        fields: [
          'name',
          'profile.personal.details.birthplace',
          'profile.personal.details.education.university',
          'profile.work.experience.current.position',
        ],
      },
    }

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
    )

    expect(result).toHaveLength(1)
    const post = result[0] as any

    expect(post.author).toEqual({
      _id: 'user_complex',
      _rev: expect.any(String),
      name: 'Complex User',
      profile: {
        personal: {
          details: {
            birthplace: 'New York',
            education: {
              university: 'MIT',
            },
          },
        },
        work: {
          experience: {
            current: {
              position: 'Senior Developer',
            },
          },
        },
      },
    })

    // Should not include the salary or degree
    expect(post.author.profile.personal.details.education).not.toHaveProperty(
      'degree',
    )
    expect(post.author.profile.work.experience.current).not.toHaveProperty(
      'salary',
    )
  })
})

describe('Foreign Key Population (Non-ID Lookups)', () => {
  let db: PouchDB.Database
  let mockContext: {
    pouchdb: PouchDB.Database
    subscriptionManager: MockSubscriptionManager
  }

  interface TestCultivar {
    _id: string
    _rev: string
    type: 'cultivar'
    cultivar_base_code: string
    cutting_form_id?: string
    name: string
    color: string
  }

  interface TestOrder {
    _id: string
    _rev: string
    type: 'order'
    material_info: {
      cultivar_id: string // Contains base code, not _id
      quantity: number
    }
  }

  beforeEach(async () => {
    db = new PouchDB('test-foreign-key', { adapter: 'memory' })

    // Install pouchdb-find plugin
    const findPlugin = require('pouchdb-find')
    PouchDB.plugin(findPlugin)
    db = new PouchDB('test-foreign-key', { adapter: 'memory' })

    mockContext = {
      pouchdb: db,
      subscriptionManager: {
        subscribeToDocs: jest.fn(() => jest.fn()),
        subscribeToView: jest.fn(() => jest.fn()),
        unsubscribeAll: jest.fn(),
      },
    }

    // Create index for cultivar_base_code
    await db.createIndex({
      index: {
        fields: ['cultivar_base_code'],
        name: 'idx_cultivar_base_code',
        ddoc: 'ddoc_cultivar',
      },
    })

    // Create test cultivars with base codes
    await db.put({
      _id: 'cultivar_4A_form1',
      type: 'cultivar',
      cultivar_base_code: '4A',
      cutting_form_id: 'form1',
      name: 'Pink Mandevilla - Form 1',
      color: 'pink',
    } as TestCultivar)

    await db.put({
      _id: 'cultivar_4A_form2',
      type: 'cultivar',
      cultivar_base_code: '4A',
      cutting_form_id: 'form2',
      name: 'Pink Mandevilla - Form 2',
      color: 'pink',
    } as TestCultivar)

    await db.put({
      _id: 'cultivar_5B_form1',
      type: 'cultivar',
      cultivar_base_code: '5B',
      cutting_form_id: 'form1',
      name: 'Red Petunia',
      color: 'red',
    } as TestCultivar)
  })

  afterEach(async () => {
    await db.destroy()
  })

  it('should populate using custom query function', async () => {
    const documents = [
      {
        _id: 'order_1',
        _rev: '1-abc',
        type: 'order',
        material_info: {
          cultivar_id: '4A', // Base code, not _id
          quantity: 100,
        },
      },
    ] as TestOrder[]

    const populateConfig: PopulateConfig = {
      'material_info.cultivar_id': {
        as: 'cultivar',
        query: (values: string[]) => ({
          selector: { cultivar_base_code: { $in: values } },
          use_index: ['ddoc_cultivar', 'idx_cultivar_base_code'],
        }),
      },
    }

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
    )

    expect(result).toHaveLength(1)
    const order = result[0] as any

    // Should populate with cultivar data (array because multiple matches)
    expect(order.cultivar).toBeDefined()
    expect(Array.isArray(order.cultivar)).toBe(true)
    expect(order.cultivar).toHaveLength(2)

    // Should include both cultivars with base code "4A"
    expect(order.cultivar).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _id: 'cultivar_4A_form1',
          cultivar_base_code: '4A',
          name: 'Pink Mandevilla - Form 1',
        }),
        expect.objectContaining({
          _id: 'cultivar_4A_form2',
          cultivar_base_code: '4A',
          name: 'Pink Mandevilla - Form 2',
        }),
      ]),
    )

    // Original field should remain unchanged
    expect(order.material_info.cultivar_id).toBe('4A')
  })

  it('should return single document when only one match exists', async () => {
    const documents = [
      {
        _id: 'order_2',
        _rev: '1-abc',
        type: 'order',
        material_info: {
          cultivar_id: '5B', // Base code with only one cultivar
          quantity: 50,
        },
      },
    ] as TestOrder[]

    const populateConfig: PopulateConfig = {
      'material_info.cultivar_id': {
        as: 'cultivar',
        query: (values: string[]) => ({
          selector: { cultivar_base_code: { $in: values } },
          use_index: ['ddoc_cultivar', 'idx_cultivar_base_code'],
        }),
      },
    }

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
    )

    expect(result).toHaveLength(1)
    const order = result[0] as any

    // Should return single document, not array
    expect(order.cultivar).toBeDefined()
    expect(Array.isArray(order.cultivar)).toBe(false)
    expect(order.cultivar).toMatchObject({
      _id: 'cultivar_5B_form1',
      cultivar_base_code: '5B',
      name: 'Red Petunia',
      color: 'red',
    })
  })

  it('should handle mixed ID-based and query-based population', async () => {
    // Create a regular user document for ID-based lookup
    await db.put({
      _id: 'user_123',
      type: 'user',
      name: 'John Doe',
      email: 'john@example.com',
    })

    const documents = [
      {
        _id: 'order_3',
        _rev: '1-abc',
        type: 'order',
        material_info: {
          cultivar_id: '4A', // Query-based (base code)
          quantity: 75,
        },
        user_id: 'user_123', // ID-based
      },
    ]

    const populateConfig: PopulateConfig = {
      'material_info.cultivar_id': {
        as: 'cultivar',
        query: (values: string[]) => ({
          selector: { cultivar_base_code: { $in: values } },
          use_index: ['ddoc_cultivar', 'idx_cultivar_base_code'],
        }),
      },
      user_id: {
        as: 'user', // Regular ID-based populate
      },
    }

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
    )

    expect(result).toHaveLength(1)
    const order = result[0] as any

    // Query-based should return array
    expect(Array.isArray(order.cultivar)).toBe(true)
    expect(order.cultivar).toHaveLength(2)

    // ID-based should return single document
    expect(order.user).toMatchObject({
      _id: 'user_123',
      name: 'John Doe',
      email: 'john@example.com',
    })
  })

  it('should handle bulk query-based population efficiently', async () => {
    const findSpy = jest.spyOn(db, 'find')

    const documents = [
      {
        _id: 'order_1',
        _rev: '1-abc',
        type: 'order',
        material_info: {
          cultivar_id: '4A',
          quantity: 100,
        },
      },
      {
        _id: 'order_2',
        _rev: '1-def',
        type: 'order',
        material_info: {
          cultivar_id: '5B',
          quantity: 50,
        },
      },
      {
        _id: 'order_3',
        _rev: '1-ghi',
        type: 'order',
        material_info: {
          cultivar_id: '4A', // Duplicate - should be deduplicated
          quantity: 75,
        },
      },
    ] as TestOrder[]

    const populateConfig: PopulateConfig = {
      'material_info.cultivar_id': {
        as: 'cultivar',
        query: (values: string[]) => ({
          selector: { cultivar_base_code: { $in: values } },
          use_index: ['ddoc_cultivar', 'idx_cultivar_base_code'],
        }),
      },
    }

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
    )

    // Should make only 1 find call with all unique base codes
    expect(findSpy).toHaveBeenCalledTimes(1)
    expect(findSpy.mock.calls[0][0].selector).toEqual({
      cultivar_base_code: { $in: expect.arrayContaining(['4A', '5B']) },
    })

    // Should deduplicate "4A" (appears in order_1 and order_3)
    const queryValues = findSpy.mock.calls[0][0].selector.cultivar_base_code.$in
    expect(queryValues).toHaveLength(2) // Only unique values: 4A, 5B

    // All orders should have cultivar populated
    expect(result).toHaveLength(3)
    expect(result[0].cultivar).toBeDefined()
    expect(result[1].cultivar).toBeDefined()
    expect(result[2].cultivar).toBeDefined()

    // Orders 1 and 3 should have same cultivar data (same base code)
    expect(result[0].cultivar).toEqual(result[2].cultivar)
  })

  it('should apply field selection to query-based population', async () => {
    const documents = [
      {
        _id: 'order_1',
        _rev: '1-abc',
        type: 'order',
        material_info: {
          cultivar_id: '5B',
          quantity: 100,
        },
      },
    ] as TestOrder[]

    const populateConfig: PopulateConfig = {
      'material_info.cultivar_id': {
        as: 'cultivar',
        fields: ['name', 'color'], // Only select specific fields
        query: (values: string[]) => ({
          selector: { cultivar_base_code: { $in: values } },
          use_index: ['ddoc_cultivar', 'idx_cultivar_base_code'],
        }),
      },
    }

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
    )

    expect(result).toHaveLength(1)
    const order = result[0] as any

    // Should include only specified fields (plus _id and _rev)
    expect(order.cultivar).toEqual({
      _id: 'cultivar_5B_form1',
      _rev: expect.any(String),
      name: 'Red Petunia',
      color: 'red',
    })

    // Should not include other fields
    expect(order.cultivar).not.toHaveProperty('cultivar_base_code')
    expect(order.cultivar).not.toHaveProperty('cutting_form_id')
    expect(order.cultivar).not.toHaveProperty('type')
  })

  it('should handle query-based population with array results and field selection', async () => {
    const documents = [
      {
        _id: 'order_1',
        _rev: '1-abc',
        type: 'order',
        material_info: {
          cultivar_id: '4A', // Multiple matches
          quantity: 100,
        },
      },
    ] as TestOrder[]

    const populateConfig: PopulateConfig = {
      'material_info.cultivar_id': {
        as: 'cultivar',
        fields: ['name', 'cutting_form_id'],
        query: (values: string[]) => ({
          selector: { cultivar_base_code: { $in: values } },
          use_index: ['ddoc_cultivar', 'idx_cultivar_base_code'],
        }),
      },
    }

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
    )

    expect(result).toHaveLength(1)
    const order = result[0] as any

    // Should be array with field selection applied to each element
    expect(Array.isArray(order.cultivar)).toBe(true)
    expect(order.cultivar).toHaveLength(2)

    order.cultivar.forEach((cultivar: any) => {
      // Each should have only selected fields
      expect(cultivar).toHaveProperty('_id')
      expect(cultivar).toHaveProperty('_rev')
      expect(cultivar).toHaveProperty('name')
      expect(cultivar).toHaveProperty('cutting_form_id')

      // Should not have other fields
      expect(cultivar).not.toHaveProperty('color')
      expect(cultivar).not.toHaveProperty('cultivar_base_code')
      expect(cultivar).not.toHaveProperty('type')
    })
  })

  it('should handle query failure gracefully', async () => {
    const documents = [
      {
        _id: 'order_1',
        _rev: '1-abc',
        type: 'order',
        material_info: {
          cultivar_id: '4A',
          quantity: 100,
        },
      },
    ] as TestOrder[]

    const populateConfig: PopulateConfig = {
      'material_info.cultivar_id': {
        as: 'cultivar',
        query: (values: string[]) => ({
          selector: { cultivar_base_code: { $in: values } },
          use_index: ['ddoc_cultivar', 'idx_cultivar_base_code'],
        }),
      },
    }

    // Mock find to throw error
    const mockErrorContext = {
      pouchdb: {
        ...db,
        find: jest.fn().mockRejectedValue(new Error('Database query error')),
      },
      subscriptionManager: mockContext.subscriptionManager,
    }

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockErrorContext as typeof mockContext,
    )

    // Should not populate the field, but document should still be returned
    expect(result).toHaveLength(1)
    expect(result[0]).not.toHaveProperty('cultivar')

    // Original data should be unchanged
    expect((result[0] as any).material_info.cultivar_id).toBe('4A')
  })

  it('should handle nested populate with query-based references', async () => {
    // Create supplier documents with indexed field
    await db.createIndex({
      index: {
        fields: ['cultivar_base_code'],
        name: 'idx_supplier_base_code',
        ddoc: 'ddoc_supplier',
      },
    })

    await db.put({
      _id: 'supplier_s1',
      type: 'supplier',
      supplier_code: 'SUP001',
      name: 'Green Thumb Supplies',
      cultivar_base_code: '5B', // Match cultivar_5B_form1
    })

    const documents = [
      {
        _id: 'order_1',
        _rev: '1-abc',
        type: 'order',
        material_info: {
          cultivar_id: '5B', // Query-based
          quantity: 100,
        },
      },
    ]

    // First populate cultivar, then populate supplier from cultivar
    const populateConfig: PopulateConfig = {
      'material_info.cultivar_id': {
        as: 'cultivar',
        query: (values: string[]) => ({
          selector: {
            cultivar_base_code: { $in: values },
            type: 'cultivar', // Filter by type to avoid matching suppliers
          },
          use_index: ['ddoc_cultivar', 'idx_cultivar_base_code'],
        }),
        populate: {
          cultivar_base_code: {
            as: 'supplier',
            query: (values: string[]) => ({
              selector: {
                cultivar_base_code: { $in: values },
                type: 'supplier', // Filter by type to avoid matching cultivars
              },
              use_index: ['ddoc_supplier', 'idx_supplier_base_code'],
            }),
          },
        },
      },
    }

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
    )

    expect(result).toHaveLength(1)
    const order = result[0] as any

    // Cultivar should be populated
    expect(order.cultivar).toBeDefined()
    expect(order.cultivar.cultivar_base_code).toBe('5B')

    // Nested supplier should also be populated
    expect(order.cultivar.supplier).toBeDefined()
    expect(order.cultivar.supplier).toMatchObject({
      _id: 'supplier_s1',
      name: 'Green Thumb Supplies',
      supplier_code: 'SUP001',
    })
  })

  it('should log performance information for query-based population in development mode', async () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'

    const consoleSpy = jest.spyOn(console, 'debug').mockImplementation()

    const documents = [
      {
        _id: 'order_1',
        _rev: '1-abc',
        type: 'order',
        material_info: {
          cultivar_id: '4A',
          quantity: 100,
        },
      },
    ] as TestOrder[]

    const populateConfig: PopulateConfig = {
      'material_info.cultivar_id': {
        as: 'cultivar',
        query: (values: string[]) => ({
          selector: { cultivar_base_code: { $in: values } },
          use_index: ['ddoc_cultivar', 'idx_cultivar_base_code'],
        }),
      },
    }

    await populateDocuments(documents, populateConfig, mockContext)

    // Should log performance with reference count
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringMatching(
        /Populate \[material_info\.cultivar_id\] took \d+ms for 1 docs, fetched \d+ refs/,
      ),
    )

    consoleSpy.mockRestore()
    process.env.NODE_ENV = originalEnv
  })

  it('should handle empty query results gracefully', async () => {
    const documents = [
      {
        _id: 'order_1',
        _rev: '1-abc',
        type: 'order',
        material_info: {
          cultivar_id: 'NONEXISTENT', // No cultivar with this base code
          quantity: 100,
        },
      },
    ] as TestOrder[]

    const populateConfig: PopulateConfig = {
      'material_info.cultivar_id': {
        as: 'cultivar',
        query: (values: string[]) => ({
          selector: { cultivar_base_code: { $in: values } },
          use_index: ['ddoc_cultivar', 'idx_cultivar_base_code'],
        }),
      },
    }

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
    )

    expect(result).toHaveLength(1)
    const order = result[0] as any

    // Should not have cultivar field (no results found)
    expect(order).not.toHaveProperty('cultivar')

    // Original data unchanged
    expect(order.material_info.cultivar_id).toBe('NONEXISTENT')
  })

  it('should prevent circular references in query-based population', async () => {
    // Create circular reference scenario
    await db.put({
      _id: 'entity_a',
      type: 'entity',
      code: 'A',
      related_code: 'B',
    })

    await db.put({
      _id: 'entity_b',
      type: 'entity',
      code: 'B',
      related_code: 'A',
    })

    await db.createIndex({
      index: {
        fields: ['code'],
        name: 'idx_code',
        ddoc: 'ddoc_entity',
      },
    })

    const documents = [
      {
        _id: 'doc_1',
        _rev: '1-abc',
        entity_code: 'A',
      },
    ]

    const populateConfig: PopulateConfig = {
      entity_code: {
        as: 'entity',
        query: (values: string[]) => ({
          selector: { code: { $in: values } },
          use_index: ['ddoc_entity', 'idx_code'],
        }),
        populate: {
          related_code: {
            as: 'related',
            query: (values: string[]) => ({
              selector: { code: { $in: values } },
              use_index: ['ddoc_entity', 'idx_code'],
            }),
          },
        },
      },
    }

    const result = await populateDocuments(
      documents,
      populateConfig,
      mockContext,
    )

    expect(result).toHaveLength(1)
    const doc = result[0] as any

    // Entity A should be populated
    expect(doc.entity).toBeDefined()
    expect(doc.entity.code).toBe('A')

    // Related entity B should be populated
    expect(doc.entity.related).toBeDefined()
    expect(doc.entity.related.code).toBe('B')

    // But the circular reference (B -> A) should not be populated
    expect(doc.entity.related.related).toBeUndefined()
  })
})
