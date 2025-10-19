import { useEffect, useMemo } from 'react'
import { matchesSelector } from 'pouchdb-selector-core'

import { useContext } from './context'
import type SubscriptionManager from './subscription'
import useStateMachine, { ResultType } from './state-machine'
import { useDeepMemo, CommonOptions } from './utils'
import { populateDocuments } from './usePopulate'
import { QueryKeyOptions, useQueryKey } from './query-key'

/**
 * Set which index to use for the query. Or create one and use it. It can be:
 *
 * - "design-doc-name"
 * - ["design-doc-name", "name"]
 * - Object to create an index (the same options as db.createIndex).
 */
export type FindHookIndexOption =
  | string
  | [string, string]
  | PouchDB.Find.CreateIndexOptions['index']

export interface FindHookOptions extends CommonOptions, QueryKeyOptions {
  /**
   * Set which index to use for the query. Or create one and use it. It can be:
   *
   * - "design-doc-name"
   * - ["design-doc-name", "name"]
   * - Object to create an index (the same options as db.createIndex).
   */
  index?: FindHookIndexOption

  /**
   * Defines a selector to filter the results. Required
   *
   * Use [Find selectors](https://docs.couchdb.org/en/stable/api/database/find.html#find-selectors).
   */
  selector: PouchDB.Find.Selector

  /**
   * Defines a list of fields that you want to receive. If omitted, you get the full documents.
   */
  fields?: string[]

  /**
   * Defines a list of fields defining how you want to sort.
   * Note that sorted fields also have to be selected in the selector.
   */
  sort?: Array<string | { [propName: string]: 'asc' | 'desc' }>

  /**
   * Maximum number of documents to return.
   */
  limit?: number

  /**
   * Number of docs to skip before returning.
   */
  skip?: number

  /**
   * When false, the query will not execute and will return an empty result.
   * When true (default), the query executes normally.
   * This follows the React Query pattern for conditional queries.
   */
  enabled?: boolean
}

/**
 * Query-relevant fields for stable query key generation
 */
const FIND_QUERY_RELEVANT_FIELDS = [
  'index',
  'selector',
  'fields',
  'sort',
  'limit',
  'skip',
] as const

/**
 * Query, and optionally create, a Mango index and subscribe to its updates.
 * @param {object} [opts] A combination of PouchDB's find options and create index options.
 */
export default function useFind<Content extends Record<string, unknown>>(
  options: FindHookOptions,
): ResultType<PouchDB.Find.FindResponse<Content>> {
  const { pouchdb: pouch, subscriptionManager } = useContext(options.db)

  if (
    typeof pouch?.createIndex !== 'function' ||
    typeof pouch?.find !== 'function'
  ) {
    throw new TypeError(
      'db.createIndex() or/and db.find() are not defined. Please install "pouchdb-find"',
    )
  }

  // Stabilize the entire options object first using useDeepMemo
  const stableOptions = useDeepMemo(options)

  // Extract populate, queryKey, and enabled option from stable options
  const {
    populate,
    queryKey: userQueryKey,
    enabled = true,
    ...findOptions
  } = stableOptions

  // Create stable options object for queryKey generation
  const queryKeyOptions = useMemo(
    () => ({ ...findOptions, queryKey: userQueryKey }),
    [findOptions, userQueryKey],
  )

  // PERFORMANCE OPTIMIZATION: Use queryKey pattern as single stable dependency
  const queryKey = useQueryKey(
    queryKeyOptions,
    FIND_QUERY_RELEVANT_FIELDS as unknown as (keyof typeof findOptions)[],
  )

  // populate is already stable from stableOptions, no need for additional memoization

  // Extract query options
  const { index, selector, fields, sort, limit, skip } = findOptions

  const [state, dispatch] = useStateMachine<PouchDB.Find.FindResponse<Content>>(
    () => ({
      docs: [],
    }),
  )

  // eslint-disable-next-line react-hooks/exhaustive-deps
  // Individual options are captured by queryKey for performance optimization
  useEffect(() => {
    // Early return when query is disabled - no fetching, no subscriptions
    if (!enabled) {
      // Smart dispatch: Only clear loading state if currently loading
      // This prevents stuck loading on initial mount or mid-query disable
      // while preserving previous data when toggling enabled off after success
      if (state.state === 'loading') {
        dispatch({ type: 'loading_finished', payload: { docs: [] } })
      }
      return () => {} // No-op cleanup
    }

    let isActive = true
    let isFetching = false
    let shouldUpdateAfter = false

    // if _id isn't in the fields array it will be added internally
    const didAddIdToFields =
      Array.isArray(fields) && fields.length > 0 && !fields.includes('_id')
    // internal fields-array. Ensure to always fetch _id
    const fieldsToFetch = didAddIdToFields ? fields?.concat(['_id']) : fields
    // Container for the ids in the result. It is in a object to be used as a ref.
    const idsInResult: { ids: Set<PouchDB.Core.DocumentId> } = {
      ids: new Set(),
    }
    let name: string | undefined = undefined
    let ddoc: string | undefined = undefined

    // Query a mango query and update the state.
    const query = async () => {
      if (isFetching) {
        shouldUpdateAfter = true
        return
      }
      isFetching = true

      dispatch({ type: 'loading_started' })

      try {
        let indexToUse: string | [string, string] | undefined = undefined
        if (ddoc && name) {
          indexToUse = [ddoc, name]
        } else if (ddoc) {
          indexToUse = ddoc
        }

        // Build query options, only including limit if it's defined
        // PouchDB v9 treats limit: undefined differently than no limit property
        const queryOptions: PouchDB.Find.FindRequest<Content> = {
          selector,
          fields: fieldsToFetch,
          sort,
          skip,
          use_index: indexToUse,
        }

        // Only add limit if it's actually defined (not undefined)
        if (limit !== undefined) {
          queryOptions.limit = limit
        }

        const result = (await pouch.find(
          queryOptions,
        )) as PouchDB.Find.FindResponse<Content>

        if (isActive) {
          idsInResult.ids = new Set()

          for (const doc of result.docs) {
            idsInResult.ids.add(doc._id)

            // if _id was added to the fields array, remove it,
            // so that the user only gets what they want.
            if (didAddIdToFields) {
              const removeDoc = doc as unknown as { _id?: string }
              delete removeDoc._id
            }
          }

          // Apply populate if configured
          if (populate && result.docs.length > 0) {
            try {
              const populatedDocs = await populateDocuments(
                result.docs as Record<string, unknown>[],
                populate,
                { pouchdb: pouch, subscriptionManager },
                { maxDepth: stableOptions?.maxDepth },
              )

              dispatch({
                type: 'loading_finished',
                payload: {
                  ...result,
                  docs: populatedDocs as PouchDB.Core.ExistingDocument<Content>[],
                },
              })
            } catch (populateError) {
              // Fallback to original result if populate fails
              dispatch({ type: 'loading_finished', payload: result })
            }
          } else {
            dispatch({ type: 'loading_finished', payload: result })
          }
        }
      } catch (error) {
        if (isActive) {
          dispatch({
            type: 'loading_error',
            payload: { error: error as PouchDB.Core.Error, setResult: false },
          })
        }
      } finally {
        isFetching = false

        // Re-query if a change did happen while querying
        if (isActive && shouldUpdateAfter) {
          shouldUpdateAfter = false
          query()
        }
      }
    }

    let unsubscribe: (() => void) | undefined = undefined

    dispatch({ type: 'loading_started' })

    // Create an index or get the index that will be used.
    getIndex(pouch, index, { selector })
      .then(([ddocId, indexName]) => {
        if (!isActive) return

        if (ddocId) {
          ddoc = ddocId
        }
        name = indexName

        query()

        unsubscribe = subscribe(
          subscriptionManager,
          selector,
          query,
          ddocId,
          idsInResult,
        )
      })
      .catch(error => {
        if (isActive) {
          dispatch({
            type: 'loading_error',
            payload: { error, setResult: false },
          })
          query()

          unsubscribe = subscribe(
            subscriptionManager,
            selector,
            query,
            null,
            idsInResult,
          )
        }
      })

    return () => {
      isActive = false
      unsubscribe?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled, // Must be first to trigger early return before any query logic
    state, // Required for smart dispatch when enabled changes
    pouch,
    subscriptionManager,
    dispatch,
    queryKey, // Single stable dependency replaces: index, selector, fields, sort, limit, skip
    populate,
    stableOptions?.maxDepth,
  ])

  // PERFORMANCE FIX: Memoize the result to prevent unnecessary re-renders
  // when the state object changes but values are identical
  const docsFingerprint = useMemo(() => {
    return state.docs?.map(doc => ({ _id: doc._id, _rev: doc._rev }))
  }, [state.docs])

  const docsFingerprintStr = useMemo(() => {
    return JSON.stringify(docsFingerprint)
  }, [docsFingerprint])

  const memoizedResult = useMemo(
    () => ({
      ...state,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, docsFingerprintStr], // docsFingerprintStr provides more efficient change detection than state.docs
  )

  return memoizedResult
}

/**
 * Get the ddoc & name of an index. Create it if the index doesn't exist.
 * @param db        - The PouchDB database.
 * @param index     - Name or Create Index options.
 * @param selector  - The selector used.
 */
function getIndex(
  db: PouchDB.Database,
  index: FindHookIndexOption | undefined,
  selector: PouchDB.Find.FindRequest<{}>,
): Promise<[string | null, string]> {
  if (index && typeof index === 'string') {
    return findIndex(db, selector)
  } else if (index && Array.isArray(index)) {
    return Promise.resolve(index)
  } else if (index && typeof index === 'object') {
    return createIndex(db, { index })
  } else {
    return findIndex(db, selector)
  }
}

/**
 * Create an index. Returns the ddoc & name.
 * @param db - The PouchDB database.
 * @param index - Options for db.createIndex
 */
async function createIndex(
  db: PouchDB.Database,
  index: PouchDB.Find.CreateIndexOptions,
): Promise<[string, string]> {
  const result = (await db.createIndex(
    index,
  )) as PouchDB.Find.CreateIndexResponse<{}> & {
    id: PouchDB.Core.DocumentId
    name: string
  }
  return [result.id, result.name]
}

/**
 * Find a index for the given selector. Returns ddoc & name.
 * @param db - The PouchDB database.
 * @param selector - The selector used.
 */
async function findIndex(
  db: PouchDB.Database,
  selector: PouchDB.Find.FindRequest<{}>,
): Promise<[string | null, string]> {
  const database = db as PouchDB.Database & {
    explain: (selector: PouchDB.Find.Selector) => Promise<ExplainResult>
  }
  const result = await database.explain(selector)
  return [result.index.ddoc, result.index.name]
}

/**
 * Subscribes to updates in the database and re-query
 * when a document did change that matches the selector.
 * @param subscriptionManager - The current subscription manager.
 * @param selector - Selector, to filter out changes.
 * @param query - Function to run a query.
 * @param id - Id of the ddoc where the index is stored.
 * @param idsInResult - Object containing a Set of ids in the last result.
 */
function subscribe(
  subscriptionManager: SubscriptionManager,
  selector: PouchDB.Find.Selector,
  query: () => void,
  id: PouchDB.Core.DocumentId | null,
  idsInResult: { ids: Set<PouchDB.Core.DocumentId> },
): () => void {
  const ddocName = id
    ? '_design/' + id.replace(/^_design\//, '') // normalize, user can add a ddoc name
    : undefined

  return subscriptionManager.subscribeToDocs<{}>(null, (_del, id, doc) => {
    if (idsInResult.ids.has(id)) {
      query()
    } else if (id === ddocName) {
      query()
    } else if (doc && typeof matchesSelector !== 'function') {
      // because pouchdb-selector-core is semver-free zone
      // If matchesSelector doesn't exist, just query every time
      query()
    } else if (doc && matchesSelector(doc, selector)) {
      query()
    }
  })
}

interface ExplainResult {
  dbname: string
  index: PouchDB.Find.Index & { defaultUsed?: true }
  selector: PouchDB.Find.Selector
  opts: {
    use_index: string[]
    bookmark: string
    limit: number | undefined
    skip: number | undefined
    sort: { [propName: string]: 'asc' | 'desc' }
    fields: string[] | undefined
    r: number[]
    conflicts: boolean
  }
  limit: number | undefined
  skip: number
  fields: string[] | undefined
  range: {
    start_key: unknown[] | null
    end_key: unknown[] | undefined
  }
}
