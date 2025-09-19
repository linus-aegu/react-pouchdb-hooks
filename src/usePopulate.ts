import type { PopulateConfig, PopulateOptions } from './populate-types'

/**
 * Subscription manager interface for type safety
 */
interface SubscriptionManager {
  subscribeToDocs: <T extends Record<string, unknown>>(
    keys: string[] | null,
    callback: (
      deleted: boolean,
      id: string,
      doc?: PouchDB.Core.Document<T>,
    ) => void,
  ) => () => void
  subscribeToView: (fun: string, callback: (id: string) => void) => () => void
  unsubscribeAll: () => void
}

/**
 * Context interface for populate operations
 */
interface PopulateContext {
  pouchdb: PouchDB.Database
  subscriptionManager: SubscriptionManager
}

/**
 * Get value from nested path like "material_info.cultivar_id"
 * Returns undefined if any part of the path doesn't exist
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  if (!obj || !path) return undefined
  return path.split('.').reduce((current: unknown, key: string): unknown => {
    if (current && typeof current === 'object' && current !== null) {
      return (current as Record<string, unknown>)[key]
    }
    return undefined
  }, obj)
}

/**
 * Set value at nested path like "material_info.cultivar"
 * Creates intermediate objects as needed
 */
function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  if (!obj || !path) return

  const keys = path.split('.')
  const lastKey = keys.pop() as string

  // Navigate/create path to the parent object
  const target = keys.reduce(
    (
      current: Record<string, unknown>,
      key: string,
    ): Record<string, unknown> => {
      if (current[key] === undefined || current[key] === null) {
        current[key] = {}
      }
      return current[key] as Record<string, unknown>
    },
    obj,
  )

  // Set the final value
  target[lastKey] = value
}

/**
 * Core populate utility function that can be called from other hooks
 * This is the pure function version that doesn't use React hooks
 */
export async function populateDocuments<T extends Record<string, unknown>>(
  documents: T[],
  populateConfig: PopulateConfig | undefined,
  context: PopulateContext,
  options: PopulateOptions = {},
): Promise<T[]> {
  // Early return if no populate config or no documents
  if (!populateConfig || !documents || documents.length === 0) {
    return documents
  }

  const { pouchdb } = context
  const startTime = Date.now()

  // Initialize recursion control
  const maxDepth = options.maxDepth ?? 3
  const visited = options._visited ?? new Set<string>()
  const currentDepth = options._currentDepth ?? 0

  // Prevent infinite recursion
  if (currentDepth >= maxDepth) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        `Populate: Maximum depth (${maxDepth}) reached, stopping recursion`,
      )
    }
    return documents
  }

  try {
    // Collect all unique reference IDs from all documents
    const referenceIds = new Set<string>()

    for (const doc of documents) {
      for (const [fieldName] of Object.entries(populateConfig)) {
        // Use getNestedValue to support nested paths
        const referenceId = getNestedValue(doc, fieldName)
        if (referenceId && typeof referenceId === 'string') {
          // Prevent circular references - don't fetch if already visited
          if (!visited.has(referenceId)) {
            referenceIds.add(referenceId)
          }
        }
      }
    }

    // Bulk fetch all referenced documents in one call
    const referenceCache: Record<
      string,
      PouchDB.Core.ExistingDocument<Record<string, unknown>>
    > = {}

    if (referenceIds.size > 0) {
      try {
        const result = await pouchdb.allDocs({
          keys: Array.from(referenceIds),
          include_docs: true,
        })

        for (const row of result.rows) {
          if ('doc' in row && row.doc && !('error' in row)) {
            referenceCache[row.doc._id] =
              row.doc as PouchDB.Core.ExistingDocument<Record<string, unknown>>
          }
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('Populate: Failed to fetch references:', error)
        }
      }
    }

    // Apply populate to documents
    const populatedDocuments = documents.map(doc => {
      const populatedDoc = { ...doc }

      // Add current document to visited set to prevent circular references
      const newVisited = new Set(visited)
      if (typeof doc._id === 'string') {
        newVisited.add(doc._id)
      }

      for (const [fieldName, fieldConfig] of Object.entries(populateConfig)) {
        // Use getNestedValue to support nested paths
        const referenceId = getNestedValue(doc, fieldName)
        if (referenceId && typeof referenceId === 'string') {
          // Skip if this would create a circular reference
          if (visited.has(referenceId)) {
            continue
          }

          const referencedDoc = referenceCache[referenceId]
          if (referencedDoc) {
            // Use setNestedValue to support nested 'as' paths
            setNestedValue(populatedDoc, fieldConfig.as, referencedDoc)
          } else if (process.env.NODE_ENV === 'development') {
            console.warn(
              `Populate: Reference not found for ${fieldName}: ${referenceId}`,
            )
          }
        }
      }

      return populatedDoc
    })

    // Handle nested populates (recursive step)
    const nestedPopulatedDocuments = await Promise.all(
      populatedDocuments.map(async doc => {
        const nestedDoc = { ...doc }

        for (const [, fieldConfig] of Object.entries(populateConfig)) {
          // Check if this field has nested populate config
          if (fieldConfig.populate) {
            // Use getNestedValue to access the populated field at nested path
            const populatedField = getNestedValue(nestedDoc, fieldConfig.as)

            if (populatedField) {
              // Recursively populate the nested document
              const nestedPopulated = await populateDocuments(
                [populatedField as Record<string, unknown>],
                fieldConfig.populate,
                context,
                {
                  ...options,
                  maxDepth,
                  _visited: new Set(visited).add(
                    typeof doc._id === 'string' ? doc._id : '',
                  ),
                  _currentDepth: currentDepth + 1,
                },
              )

              if (nestedPopulated.length > 0) {
                // Use setNestedValue to update the nested populated field
                setNestedValue(nestedDoc, fieldConfig.as, nestedPopulated[0])
              }
            }
          }
        }

        return nestedDoc
      }),
    )

    // Performance monitoring in development
    if (process.env.NODE_ENV === 'development') {
      const duration = Date.now() - startTime
      const fieldNames = Object.keys(populateConfig)
      const depthInfo = currentDepth > 0 ? ` (depth ${currentDepth})` : ''
      console.debug(
        `Populate [${fieldNames.join(', ')}] took ${duration}ms for ${
          documents.length
        } docs${depthInfo}`,
      )
    }

    return nestedPopulatedDocuments
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Populate: Error during population:', error)
    }
    return documents // Return original documents on error
  }
}
