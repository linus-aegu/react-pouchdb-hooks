import { useMemo, useRef } from 'react'
import isEqual from 'fast-deep-equal'
import type { PopulateConfig } from './populate-types'

/**
 * Memorize a value. Only invalidate if the value in it did change. Does a deep equal.
 *
 * PERFORMANCE OPTIMIZATION: Now checks reference equality first before
 * performing expensive deep comparison, reducing CPU overhead.
 *
 * @param option Options to memorize.
 */
export function useDeepMemo<T>(option: T): T {
  const last = useRef(option)
  return useMemo(() => {
    // PERFORMANCE: Check reference equality first to avoid expensive deep comparison
    if (last.current === option) {
      return last.current
    }
    // Only perform deep comparison if reference changed
    if (isEqual(last.current, option)) {
      return last.current
    } else {
      last.current = option
      return option
    }
  }, [option])
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
