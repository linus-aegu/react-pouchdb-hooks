import { useMemo } from 'react'
import isEqual from 'fast-deep-equal'

/**
 * Configuration options for query key generation
 */
export interface QueryKeyOptions {
  /**
   * Optional stable query key for caching and comparison.
   * If provided, this will be used instead of auto-generating from options.
   */
  queryKey?: string | readonly unknown[]
}

/**
 * Deterministic serialization that handles object key ordering
 * and common edge cases in PouchDB options
 */
export function stableStringify(obj: unknown, visited = new WeakSet()): string {
  if (obj === null) return 'null'
  if (obj === undefined) return 'undefined'
  if (typeof obj !== 'object') return JSON.stringify(obj)

  // Check for circular references
  if (visited.has(obj as Record<string, unknown>)) {
    return `{error:${Date.now()}}`
  }

  if (Array.isArray(obj)) {
    visited.add(obj)
    try {
      const result =
        '[' + obj.map(item => stableStringify(item, visited)).join(',') + ']'
      visited.delete(obj)
      return result
    } catch (error) {
      visited.delete(obj)
      console.warn('Query key serialization failed, using fallback:', error)
      return `[error:${Date.now()}]`
    }
  }

  visited.add(obj)
  try {
    // Sort keys for deterministic serialization
    const sortedKeys = Object.keys(obj as Record<string, unknown>).sort()
    const pairs = sortedKeys.map(key => {
      const value = (obj as Record<string, unknown>)[key]
      return JSON.stringify(key) + ':' + stableStringify(value, visited)
    })
    const result = '{' + pairs.join(',') + '}'
    visited.delete(obj)
    return result
  } catch (error) {
    visited.delete(obj)
    // Handle circular references or other serialization errors
    console.warn('Query key serialization failed, using fallback:', error)
    return `{error:${Date.now()}}`
  }
}

/**
 * Fast shallow equality check for objects
 */
function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    a === null ||
    b === null
  ) {
    return false
  }

  const keysA = Object.keys(a as Record<string, unknown>)
  const keysB = Object.keys(b as Record<string, unknown>)

  if (keysA.length !== keysB.length) return false

  for (const key of keysA) {
    if (!(key in (b as Record<string, unknown>))) return false
    if (
      (a as Record<string, unknown>)[key] !==
      (b as Record<string, unknown>)[key]
    ) {
      return false
    }
  }

  return true
}

/**
 * Normalize options by removing functions and handling undefined values
 * This ensures consistent serialization of PouchDB options
 */
function normalizeForSerialization(options: unknown): unknown {
  if (options === null || options === undefined) return null
  if (typeof options !== 'object') return options
  if (Array.isArray(options)) {
    return options.map(normalizeForSerialization)
  }

  const normalized: Record<string, unknown> = {}
  const obj = options as Record<string, unknown>

  for (const [key, value] of Object.entries(obj)) {
    // Skip functions as they can't be serialized meaningfully
    if (typeof value === 'function') continue

    // Convert undefined to null for consistent keys
    if (value === undefined) {
      normalized[key] = null
    } else if (typeof value === 'object') {
      normalized[key] = normalizeForSerialization(value)
    } else {
      normalized[key] = value
    }
  }

  return normalized
}

/**
 * High-performance query key generator with multi-tier comparison
 */
export class QueryKeyGenerator {
  private cache = new WeakMap<Record<string, unknown>, string>()
  private lastOptions = new WeakMap<Record<string, unknown>, unknown>()
  private lastKey = new WeakMap<Record<string, unknown>, string>()

  /**
   * Generate a stable query key using multi-tier optimization:
   * 1. Reference equality (fastest)
   * 2. Shallow comparison
   * 3. Deep comparison
   * 4. Serialization (slowest, only when needed)
   */
  generate(options: unknown): string {
    // Handle primitives directly
    if (typeof options !== 'object' || options === null) {
      return stableStringify(options)
    }

    const optionsObj = options as Record<string, unknown>

    // Tier 1: Reference equality (instant)
    const cachedKey = this.cache.get(optionsObj)
    if (cachedKey !== undefined) {
      return cachedKey
    }

    // Tier 2: Check if we've seen similar options before
    const lastSeenOptions = this.lastOptions.get(optionsObj)
    const lastSeenKey = this.lastKey.get(optionsObj)

    if (lastSeenOptions !== undefined && lastSeenKey !== undefined) {
      // Tier 2a: Reference equality check
      if (lastSeenOptions === options) {
        this.cache.set(optionsObj, lastSeenKey)
        return lastSeenKey
      }

      // Tier 2b: Shallow comparison
      if (shallowEqual(lastSeenOptions, options)) {
        this.cache.set(optionsObj, lastSeenKey)
        return lastSeenKey
      }

      // Tier 2c: Deep comparison (before expensive serialization)
      if (isEqual(lastSeenOptions, options)) {
        this.cache.set(optionsObj, lastSeenKey)
        return lastSeenKey
      }
    }

    // Tier 3: Generate new key (expensive but rare)
    const normalizedOptions = normalizeForSerialization(options)
    const newKey = stableStringify(normalizedOptions)

    // Cache for future use
    this.cache.set(optionsObj, newKey)
    this.lastOptions.set(optionsObj, options)
    this.lastKey.set(optionsObj, newKey)

    return newKey
  }

  /**
   * Generate key from user-provided queryKey option
   */
  generateFromUserKey(queryKey: string | readonly unknown[]): string {
    if (typeof queryKey === 'string') {
      return queryKey
    }

    return stableStringify(queryKey)
  }

  /**
   * Clear cache (useful for testing or memory management)
   */
  clearCache(): void {
    this.cache = new WeakMap()
    this.lastOptions = new WeakMap()
    this.lastKey = new WeakMap()
  }
}

/**
 * Global query key generator instance
 */
export const queryKeyGenerator = new QueryKeyGenerator()

/**
 * Hook for generating stable query keys with optimized comparison
 * This replaces multiple useDeepMemo calls with a single optimized comparison
 */
export function useQueryKey<T extends Record<string, unknown>>(
  options: T & QueryKeyOptions,
  relevantFields: (keyof T)[],
): string {
  const generator = queryKeyGenerator

  return useMemo(() => {
    // If user provided explicit queryKey, use it
    if (options.queryKey !== undefined) {
      return generator.generateFromUserKey(options.queryKey)
    }

    // Extract only query-relevant fields for key generation
    const queryRelevantOptions: Record<string, unknown> = {}
    for (const field of relevantFields) {
      if (field in options && field !== 'queryKey') {
        queryRelevantOptions[field as string] = options[field]
      }
    }

    // Generate stable key from the query-relevant options
    return generator.generate(queryRelevantOptions)
  }, [generator, options, relevantFields])
}
