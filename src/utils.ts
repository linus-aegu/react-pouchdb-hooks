import { useRef } from 'react'
import isEqual from 'fast-deep-equal'
import type { PopulateConfig } from './populate-types'
import { populateDocuments } from './usePopulate'
import type SubscriptionManager from './subscription'

/**
 * Memorize a value. Only invalidate if the value in it did change. Does a deep equal.
 *
 * PERFORMANCE OPTIMIZATION: Now checks reference equality first before
 * performing expensive deep comparison, reducing CPU overhead.
 *
 * @param option Options to memorize.
 */
export function useDeepMemo<T>(option: T): T {
  const last = useRef<T>(option)
  const current = useRef<T>(option)

  // Always update current ref
  current.current = option

  // Check if deeply equal - if not, update stable ref
  if (!isEqual(last.current, current.current)) {
    last.current = current.current
  }

  // Always return the stable reference
  return last.current
}

/**
 * Context interface for populate operations
 */
export interface PopulateContext {
  pouchdb: PouchDB.Database
  subscriptionManager: SubscriptionManager
}

/**
 * Apply populate configuration to a single document result.
 * Used by useDoc hook.
 *
 * @param doc - The document to populate (or null)
 * @param populate - Populate configuration
 * @param context - Database and subscription manager context
 * @param options - Additional options including maxDepth
 * @returns Populated document or original document
 */
export async function applyPopulateToDoc<T extends Record<string, unknown>>(
  doc: (PouchDB.Core.Document<T> & PouchDB.Core.GetMeta) | null,
  populate: PopulateConfig | undefined,
  context: PopulateContext,
  options?: { maxDepth?: number },
): Promise<(PouchDB.Core.Document<T> & PouchDB.Core.GetMeta) | null> {
  if (!populate || !doc) {
    return doc
  }

  const populatedDocs = await populateDocuments(
    [doc as Record<string, unknown>],
    populate,
    context,
    { maxDepth: options?.maxDepth },
  )

  return (
    (populatedDocs[0] as PouchDB.Core.Document<T> & PouchDB.Core.GetMeta) || doc
  )
}

/**
 * Apply populate configuration to allDocs result rows.
 * Used by useAllDocs hook.
 *
 * @param result - The allDocs result
 * @param populate - Populate configuration
 * @param context - Database and subscription manager context
 * @param options - Additional options including maxDepth
 * @returns Result with populated documents in rows
 */
export async function applyPopulateToAllDocs<
  Content extends Record<string, unknown>,
>(
  result: PouchDB.Core.AllDocsResponse<Content>,
  populate: PopulateConfig | undefined,
  include_docs: boolean | undefined,
  context: PopulateContext,
  options?: { maxDepth?: number },
): Promise<PouchDB.Core.AllDocsResponse<Content>> {
  if (!populate || !include_docs || !result.rows) {
    return result
  }

  const docsToPopulate = result.rows
    .map(row => row.doc)
    .filter(Boolean) as Content[]

  if (docsToPopulate.length === 0) {
    return result
  }

  const populatedDocs = await populateDocuments(
    docsToPopulate,
    populate,
    context,
    { maxDepth: options?.maxDepth },
  )

  // Update rows with populated documents
  const populatedRows = result.rows.map((row, index) => ({
    ...row,
    doc: row.doc
      ? (populatedDocs[index] as PouchDB.Core.ExistingDocument<
          Content & PouchDB.Core.AllDocsMeta
        >) || row.doc
      : row.doc,
  }))

  return {
    ...result,
    rows: populatedRows,
  }
}

/**
 * Apply populate configuration to find query result.
 * Used by useFind hook.
 *
 * @param result - The find query result
 * @param populate - Populate configuration
 * @param context - Database and subscription manager context
 * @param options - Additional options including maxDepth
 * @returns Result with populated documents
 */
export async function applyPopulateToFind<
  Content extends Record<string, unknown>,
>(
  result: PouchDB.Find.FindResponse<Content>,
  populate: PopulateConfig | undefined,
  context: PopulateContext,
  options?: { maxDepth?: number },
): Promise<PouchDB.Find.FindResponse<Content>> {
  if (!populate || !result.docs || result.docs.length === 0) {
    return result
  }

  const populatedDocs = await populateDocuments(
    result.docs as Record<string, unknown>[],
    populate,
    context,
    { maxDepth: options?.maxDepth },
  )

  return {
    ...result,
    docs: populatedDocs as PouchDB.Core.ExistingDocument<Content>[],
  }
}

/**
 * Apply populate configuration to view query result rows.
 * Used by useView hook (both doDDocQuery and doTemporaryQuery).
 *
 * @param result - The view query result
 * @param populate - Populate configuration
 * @param include_docs - Whether docs are included in the result
 * @param context - Database and subscription manager context
 * @param options - Additional options including maxDepth
 * @returns Result with populated documents in rows
 */
export async function applyPopulateToView<
  Result extends Record<string, unknown>,
>(
  result: PouchDB.Query.Response<Result>,
  populate: PopulateConfig | undefined,
  include_docs: boolean | undefined,
  context: PopulateContext,
  options?: { maxDepth?: number },
): Promise<PouchDB.Query.Response<Result>> {
  if (!populate || !include_docs || !result.rows) {
    return result
  }

  const docsToPopulate = result.rows.map(row => row.doc).filter(Boolean)

  if (docsToPopulate.length === 0) {
    return result
  }

  const populatedDocs = await populateDocuments(
    docsToPopulate as Record<string, unknown>[],
    populate,
    context,
    { maxDepth: options?.maxDepth },
  )

  // Update rows with populated documents
  const populatedRows = result.rows.map((row, index) => ({
    ...row,
    doc: row.doc
      ? (populatedDocs[index] as PouchDB.Core.ExistingDocument<
          Result & PouchDB.Core.AllDocsMeta
        >) || row.doc
      : row.doc,
  }))

  return {
    ...result,
    rows: populatedRows,
  }
}

export interface CommonOptions {
  /**
   * Select the database to be used. Use the key/name used at the <Provider>.
   * "_default" is the spacial key for using the default database.
   * The default database is the database of the closest <Provider> with a single db or
   * the default-property in the closest multi-db <Provider>
   * Defaults to "_default".
   */
  db?: string

  /**
   * Optional populate configuration for automatically loading referenced documents
   *
   * @example
   * populate: {
   *   site_id: { as: 'site' },
   *   author_id: { as: 'author' }
   * }
   */
  populate?: PopulateConfig

  /**
   * Maximum recursion depth for nested populates (default: 3)
   */
  maxDepth?: number
}
