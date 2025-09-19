import { useEffect, useMemo } from 'react'

import { useContext } from './context'
import useStateMachine, { ResultType } from './state-machine'
import { useDeepMemo, CommonOptions } from './utils'
import { populateDocuments } from './usePopulate'
import { QueryKeyOptions, useQueryKey } from './query-key'

/**
 * Query-relevant fields for stable query key generation
 */
const ALLDOCS_QUERY_RELEVANT_FIELDS = [
  'include_docs',
  'conflicts',
  'attachments',
  'binary',
  'limit',
  'skip',
  'descending',
  'update_seq',
  'startkey',
  'endkey',
  'inclusive_end',
  'key',
  'keys',
] as const

/**
 * Get all docs or a slice of all docs and subscribe to their updates.
 * @param options PouchDB's allDocs options.
 */
export default function useAllDocs<Content extends Record<string, unknown>>(
  options?: CommonOptions &
    QueryKeyOptions &
    (
      | PouchDB.Core.AllDocsWithKeyOptions
      | PouchDB.Core.AllDocsWithKeysOptions
      | PouchDB.Core.AllDocsWithinRangeOptions
      | PouchDB.Core.AllDocsOptions
    ),
): ResultType<PouchDB.Core.AllDocsResponse<Content>> {
  const { pouchdb: pouch, subscriptionManager } = useContext(options?.db)

  // Stabilize the entire options object first using useDeepMemo
  const stableOptions = useDeepMemo(options || {})

  // Extract populate and queryKey options from stable options
  const { populate, queryKey: userQueryKey, ...allDocsOptions } = stableOptions

  // Extract options for immediate use
  const {
    include_docs,
    conflicts,
    attachments,
    binary,
    limit,
    skip,
    descending,
    update_seq,
  } = allDocsOptions
  const { startkey, endkey, inclusive_end } =
    (allDocsOptions as PouchDB.Core.AllDocsWithinRangeOptions) || {}
  const { key } = (allDocsOptions as PouchDB.Core.AllDocsWithKeyOptions) || {}
  const keys: string[] | undefined = (
    allDocsOptions as PouchDB.Core.AllDocsWithKeysOptions
  )?.keys

  // Create stable options object for queryKey generation
  const queryKeyOptions = useMemo(
    () => ({
      ...allDocsOptions,
      keys, // Include keys in the options for stable comparison
      queryKey: userQueryKey,
    }),
    [allDocsOptions, keys, userQueryKey],
  )

  // PERFORMANCE OPTIMIZATION: Use queryKey pattern as single stable dependency
  const queryKey = useQueryKey(
    queryKeyOptions,
    ALLDOCS_QUERY_RELEVANT_FIELDS as unknown as (keyof typeof allDocsOptions)[],
  )

  // populate is already stable from stableOptions, no need for additional memoization

  const [state, dispatch, replace] = useStateMachine<
    PouchDB.Core.AllDocsResponse<Content>
  >(() => ({
    rows: [],
    total_rows: 0,
    offset: 0,
  }))

  // eslint-disable-next-line react-hooks/exhaustive-deps
  // Individual options are captured by queryKey for performance optimization
  useEffect(() => {
    let isMounted = true
    let isFetching = false
    let shouldUpdateAfter = false

    const opt = {
      include_docs,
      conflicts,
      attachments,
      binary,
      limit,
      skip,
      descending,
      update_seq,
      startkey,
      endkey,
      inclusive_end,
      key,
      keys,
    }

    const fetch = async () => {
      if (isFetching) {
        shouldUpdateAfter = true
        return
      }
      isFetching = true
      shouldUpdateAfter = false
      dispatch({ type: 'loading_started' })

      try {
        const result = await pouch.allDocs<Content>(opt)

        if (isMounted) {
          // Apply populate if configured and include_docs is true
          if (populate && include_docs && result.rows) {
            try {
              const docsToPopulate = result.rows
                .map(row => row.doc)
                .filter(Boolean) as Content[]

              if (docsToPopulate.length > 0) {
                const populatedDocs = await populateDocuments(
                  docsToPopulate,
                  populate,
                  { pouchdb: pouch, subscriptionManager },
                  { maxDepth: stableOptions?.maxDepth },
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

                dispatch({
                  type: 'loading_finished',
                  payload: {
                    ...result,
                    rows: populatedRows,
                  },
                })
              } else {
                dispatch({
                  type: 'loading_finished',
                  payload: result,
                })
              }
            } catch (populateError) {
              // Fallback to original result if populate fails
              dispatch({
                type: 'loading_finished',
                payload: result,
              })
            }
          } else {
            dispatch({
              type: 'loading_finished',
              payload: result,
            })
          }
        }
      } catch (err) {
        if (isMounted) {
          dispatch({
            type: 'loading_error',
            payload: {
              error: err as PouchDB.Core.Error,
              setResult: false,
            },
          })
        }
      } finally {
        // refresh if change did happen while querying
        isFetching = false
        if (shouldUpdateAfter && isMounted) {
          fetch()
        }
      }
    }

    fetch()

    let keysToSubscribe: null | string[] = null

    if (key != null) {
      keysToSubscribe = [key]
    } else if (keys != null) {
      keysToSubscribe = keys
    }

    const unsubscribe = subscriptionManager.subscribeToDocs(
      keysToSubscribe,
      (deleted, id) => {
        if (
          !isMounted ||
          !isInRange(id, startkey, endkey, inclusive_end, descending)
        ) {
          return
        }

        if (deleted) {
          replace(result => {
            const rows = result.rows.filter(row => row.id !== id)
            return {
              ...result,
              rows,
              total_rows:
                result.total_rows - (result.rows.length - rows.length),
            }
          })
        } else {
          fetch()
        }
      },
    )

    return () => {
      isMounted = false
      unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dispatch,
    replace,
    pouch,
    subscriptionManager,
    queryKey, // Single stable dependency replaces all query-related options
    populate,
    stableOptions?.maxDepth,
  ])

  return state
}

/**
 * Check if the updated document is inside of the range.
 * @param id Id of the updated document
 * @param startkey Startkey option.
 * @param endkey Endkey option.
 * @param inclusive_end Is the endkey inclusive?
 * @param descending Which direction should the slice go?
 */
function isInRange(
  id: PouchDB.Core.DocumentId,
  startkey: string | undefined,
  endkey: string | undefined,
  inclusive_end: boolean | undefined,
  descending: boolean | undefined,
): boolean {
  if (
    startkey &&
    ((descending && id > startkey) || (!descending && id < startkey))
  ) {
    return false
  }
  if (endkey == null) {
    return true
  }
  if (inclusive_end) {
    return descending ? id >= endkey : id <= endkey
  } else {
    return descending ? id > endkey : id < endkey
  }
}
