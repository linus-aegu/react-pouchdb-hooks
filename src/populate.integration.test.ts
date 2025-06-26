import PouchDB from 'pouchdb-core'
import memory from 'pouchdb-adapter-memory'
import mapReduce from 'pouchdb-mapreduce'
import find from 'pouchdb-find'

import { renderHook, waitForNextUpdate } from './test-utils'
import useDoc from './useDoc'
import useAllDocs from './useAllDocs'
import useFind from './useFind'
import useView from './useView'
import type { PopulateConfig } from './populate-types'

PouchDB.plugin(memory)
PouchDB.plugin(mapReduce)
PouchDB.plugin(find)

interface TestPost {
  _id: string
  _rev?: string
  type: 'post'
  title: string
  site_id: string
  author_id: string
  category_id?: string
}

interface TestSite {
  _id: string
  _rev?: string
  type: 'site'
  name: string
  domain: string
}

interface TestUser {
  _id: string
  _rev?: string
  type: 'user'
  name: string
  email: string
}

interface TestCategory {
  _id: string
  _rev?: string
  type: 'category'
  name: string
}

describe('Populate Integration Tests', () => {
  let db: PouchDB.Database

  beforeEach(async () => {
    db = new PouchDB('test-populate-integration', { adapter: 'memory' })
    await setupTestData()
  })

  afterEach(async () => {
    await db.destroy()
  })

  async function setupTestData() {
    // Create reference documents
    await db.bulkDocs([
      // Sites
      {
        _id: 'site_1',
        type: 'site',
        name: 'Tech Blog',
        domain: 'techblog.com',
      } as TestSite,
      {
        _id: 'site_2',
        type: 'site',
        name: 'News Site',
        domain: 'news.com',
      } as TestSite,

      // Users
      {
        _id: 'user_1',
        type: 'user',
        name: 'John Doe',
        email: 'john@example.com',
      } as TestUser,
      {
        _id: 'user_2',
        type: 'user',
        name: 'Jane Smith',
        email: 'jane@example.com',
      } as TestUser,

      // Categories
      { _id: 'cat_1', type: 'category', name: 'Technology' } as TestCategory,
      { _id: 'cat_2', type: 'category', name: 'Politics' } as TestCategory,

      // Posts
      {
        _id: 'post_1',
        type: 'post',
        title: 'First Post',
        site_id: 'site_1',
        author_id: 'user_1',
        category_id: 'cat_1',
      } as TestPost,
      {
        _id: 'post_2',
        type: 'post',
        title: 'Second Post',
        site_id: 'site_2',
        author_id: 'user_2',
        category_id: 'cat_2',
      } as TestPost,
      {
        _id: 'post_3',
        type: 'post',
        title: 'Third Post',
        site_id: 'site_1',
        author_id: 'user_1',
        category_id: 'cat_1',
      } as TestPost,
    ])

    // Create design document for view tests
    await db.put({
      _id: '_design/posts',
      views: {
        by_site: {
          map: function (doc: TestPost) {
            if (doc.type === 'post') {
              emit(doc.site_id, doc)
            }
          }.toString(),
        },
        by_author: {
          map: function (doc: TestPost) {
            if (doc.type === 'post') {
              emit(doc.author_id, doc)
            }
          }.toString(),
        },
      },
    })

    // Create index for find tests
    await db.createIndex({
      index: {
        fields: ['type', 'site_id'],
      },
    })
  }

  describe('Cross-Hook Populate Consistency', () => {
    const populateConfig: PopulateConfig = {
      site_id: { as: 'site' },
      author_id: { as: 'author' },
      category_id: { as: 'category' },
    }

    it('should provide consistent populate results across useDoc and useAllDocs', async () => {
      // Test useDoc
      const { result: docResult } = renderHook(
        () => useDoc<TestPost>('post_1', { populate: populateConfig }),
        { pouchdb: db }
      )

      await waitForNextUpdate(docResult)

      expect(docResult.current.state).toBe('done')
      const docPopulated = docResult.current.doc as TestPost & {
        site: TestSite
        author: TestUser
        category: TestCategory
      }

      // Test useAllDocs
      const { result: allDocsResult } = renderHook(
        () =>
          useAllDocs<TestPost>({
            include_docs: true,
            startkey: 'post_1',
            endkey: 'post_1',
            populate: populateConfig,
          }),
        { pouchdb: db }
      )

      await waitForNextUpdate(allDocsResult)

      expect(allDocsResult.current.state).toBe('done')
      const allDocsPopulated = allDocsResult.current.rows[0].doc as TestPost & {
        site: TestSite
        author: TestUser
        category: TestCategory
      }

      // Both should have the same populated data
      expect(docPopulated.site).toEqual(allDocsPopulated.site)
      expect(docPopulated.author).toEqual(allDocsPopulated.author)
      expect(docPopulated.category).toEqual(allDocsPopulated.category)
    })

    it('should provide consistent populate results across useFind and useView', async () => {
      // Test useFind
      const { result: findResult } = renderHook(
        () =>
          useFind<TestPost>({
            selector: { type: 'post', _id: 'post_1' },
            populate: populateConfig,
          }),
        { pouchdb: db }
      )

      await waitForNextUpdate(findResult)

      expect(findResult.current.state).toBe('done')
      expect(findResult.current.docs).toHaveLength(1)
      const findPopulated = findResult.current.docs[0] as TestPost & {
        site: TestSite
        author: TestUser
        category: TestCategory
      }

      // Test useView with temporary view
      const temporaryView = (doc: TestPost) => {
        if (doc.type === 'post' && doc._id === 'post_1') {
          emit(doc._id, doc)
        }
      }

      const { result: viewResult } = renderHook(
        () =>
          useView<TestPost, TestPost>(temporaryView, {
            include_docs: true,
            populate: populateConfig,
          }),
        { pouchdb: db }
      )

      await waitForNextUpdate(viewResult)

      expect(viewResult.current.state).toBe('done')
      expect(viewResult.current.rows).toHaveLength(1)
      const viewPopulated = viewResult.current.rows[0].doc as TestPost & {
        site: TestSite
        author: TestUser
        category: TestCategory
      }

      // Both should have the same populated data
      expect(findPopulated.site).toEqual(viewPopulated.site)
      expect(findPopulated.author).toEqual(viewPopulated.author)
      expect(findPopulated.category).toEqual(viewPopulated.category)
    })

    it('should provide consistent populate results with design document views', async () => {
      const { result: viewResult } = renderHook(
        () =>
          useView<TestPost, TestPost>('posts/by_site', {
            key: 'site_1',
            include_docs: true,
            populate: populateConfig,
          }),
        { pouchdb: db }
      )

      await waitForNextUpdate(viewResult)

      expect(viewResult.current.state).toBe('done')
      expect(viewResult.current.rows.length).toBeGreaterThan(0)

      // All populated documents should have consistent structure
      viewResult.current.rows.forEach(row => {
        const populated = row.doc as TestPost & {
          site: TestSite
          author: TestUser
          category?: TestCategory
        }

        expect(populated.site).toBeDefined()
        expect(populated.site._id).toBe('site_1')
        expect(populated.site.name).toBe('Tech Blog')

        expect(populated.author).toBeDefined()
        expect(populated.author.name).toBeDefined()

        // All our test posts have category_id, so category should be populated
        expect(populated.category_id).toBeDefined()
        expect(populated.category).toBeDefined()
        expect(populated.category?.name).toBeDefined()
      })
    })
  })

  describe('Performance and Caching Integration', () => {
    it('should efficiently share populate cache across multiple hooks', async () => {
      const populateConfig: PopulateConfig = {
        site_id: { as: 'site' },
      }

      // Test that multiple hooks can use populate successfully
      const { result: docResult1 } = renderHook(
        () => useDoc<TestPost>('post_1', { populate: populateConfig }),
        { pouchdb: db }
      )

      await waitForNextUpdate(docResult1)

      expect(docResult1.current.state).toBe('done')
      const doc1 = docResult1.current.doc as TestPost & { site: TestSite }
      expect(doc1.site).toBeDefined()
      expect(doc1.site.name).toBe('Tech Blog')

      // Test that a second hook also works with populate
      const { result: docResult2 } = renderHook(
        () => useDoc<TestPost>('post_3', { populate: populateConfig }),
        { pouchdb: db }
      )

      await waitForNextUpdate(docResult2)

      expect(docResult2.current.state).toBe('done')
      const doc3 = docResult2.current.doc as TestPost & { site: TestSite }

      // Both docs should reference the same site (site_1) and should be populated
      expect(doc3.site).toBeDefined()
      expect(doc1.site).toEqual(doc3.site)
      expect(doc3.site.name).toBe('Tech Blog')
    })
  })

  describe('Error Handling Consistency', () => {
    it('should handle populate errors gracefully across all hooks', async () => {
      const populateConfig: PopulateConfig = {
        site_id: { as: 'site' },
        nonexistent_field: { as: 'missing' },
      }

      // Test with useDoc
      const { result: docResult } = renderHook(
        () => useDoc<TestPost>('post_1', { populate: populateConfig }),
        { pouchdb: db }
      )

      await waitForNextUpdate(docResult)

      expect(docResult.current.state).toBe('done')
      const docPopulated = docResult.current.doc as TestPost & {
        site: TestSite
        missing?: unknown
      }

      expect(docPopulated.site).toBeDefined()
      expect(docPopulated.missing).toBeUndefined()

      // Test with useFind
      const { result: findResult } = renderHook(
        () =>
          useFind<TestPost>({
            selector: { type: 'post', _id: 'post_1' },
            populate: populateConfig,
          }),
        { pouchdb: db }
      )

      await waitForNextUpdate(findResult)

      expect(findResult.current.state).toBe('done')
      const findPopulated = findResult.current.docs[0] as TestPost & {
        site: TestSite
        missing?: unknown
      }

      expect(findPopulated.site).toBeDefined()
      expect(findPopulated.missing).toBeUndefined()

      // Both should handle errors consistently
      expect(docPopulated.site).toEqual(findPopulated.site)
    })
  })

  describe('Real-world Scenarios', () => {
    it('should handle blog post scenario with multiple relationships', async () => {
      const blogPopulateConfig: PopulateConfig = {
        site_id: { as: 'site' },
        author_id: { as: 'author' },
        category_id: { as: 'category' },
      }

      const { result } = renderHook(
        () =>
          useFind<TestPost>({
            selector: { type: 'post' },
            populate: blogPopulateConfig,
          }),
        { pouchdb: db }
      )

      await waitForNextUpdate(result)

      expect(result.current.state).toBe('done')
      expect(result.current.docs.length).toBeGreaterThan(0)

      // Each post should have all relationships populated
      result.current.docs.forEach(doc => {
        const populated = doc as TestPost & {
          site: TestSite
          author: TestUser
          category: TestCategory
        }

        expect(populated.site).toBeDefined()
        expect(populated.site.name).toBeDefined()

        expect(populated.author).toBeDefined()
        expect(populated.author.name).toBeDefined()

        expect(populated.category).toBeDefined()
        expect(populated.category.name).toBeDefined()
      })
    })

    it('should handle updates to populated documents across hooks', async () => {
      const populateConfig: PopulateConfig = {
        site_id: { as: 'site' },
      }

      // Start with useDoc
      const { result: docResult } = renderHook(
        () => useDoc<TestPost>('post_1', { populate: populateConfig }),
        { pouchdb: db }
      )

      await waitForNextUpdate(docResult)

      const initialDoc = docResult.current.doc as TestPost & { site: TestSite }
      expect(initialDoc.site.name).toBe('Tech Blog')

      // Update the referenced site
      const site = await db.get<TestSite>('site_1')
      await db.put({
        ...site,
        name: 'Updated Tech Blog',
      })

      // Test that useFind gets the updated data
      const { result: findResult } = renderHook(
        () =>
          useFind<TestPost>({
            selector: { type: 'post', _id: 'post_1' },
            populate: populateConfig,
          }),
        { pouchdb: db }
      )

      await waitForNextUpdate(findResult)

      const findDoc = findResult.current.docs[0] as TestPost & {
        site: TestSite
      }
      expect(findDoc.site.name).toBe('Updated Tech Blog')
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty document sets with populate', async () => {
      const { result } = renderHook(
        () =>
          useFind<TestPost>({
            selector: { type: 'post', _id: 'nonexistent' },
            populate: { site_id: { as: 'site' } },
          }),
        { pouchdb: db }
      )

      await waitForNextUpdate(result)

      expect(result.current.state).toBe('done')
      expect(result.current.docs).toHaveLength(0)
      // Should not throw errors with empty results
    })

    it('should handle large document sets with populate efficiently', async () => {
      // Create many test documents
      const largeDocs = Array.from(
        { length: 50 },
        (_, i) =>
          ({
            _id: `large_post_${i}`,
            type: 'post',
            title: `Large Post ${i}`,
            site_id: 'site_1',
            author_id: 'user_1',
          } as TestPost)
      )

      await db.bulkDocs(largeDocs)

      const startTime = Date.now()

      const { result } = renderHook(
        () =>
          useFind<TestPost>({
            selector: { type: 'post' },
            limit: 100, // Override PouchDB v9 default limit of 25
            populate: {
              site_id: { as: 'site' },
              author_id: { as: 'author' },
            },
          }),
        { pouchdb: db }
      )

      await waitForNextUpdate(result)

      const endTime = Date.now()
      const duration = endTime - startTime

      expect(result.current.state).toBe('done')
      expect(result.current.docs.length).toBeGreaterThanOrEqual(53)

      // Should handle large sets efficiently
      expect(duration).toBeLessThan(2000)

      // Verify all documents are properly populated
      result.current.docs.forEach(doc => {
        const populated = doc as TestPost & {
          site: TestSite
          author: TestUser
        }

        expect(populated.site).toBeDefined()
        expect(populated.author).toBeDefined()
      })
    })
  })
})
