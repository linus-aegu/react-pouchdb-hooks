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
 * Extract only specified fields from a document, including nested paths
 * Always preserves _id and _rev for document integrity
 */
function extractFields(
  doc: Record<string, unknown>,
  fields?: string[],
  populateConfig?: PopulateConfig,
): Record<string, unknown> {
  // If no fields specified, return the entire document
  if (!fields || fields.length === 0) {
    return doc
  }

  const extracted: Record<string, unknown> = {}

  // Always include _id and _rev for document integrity
  if (doc._id !== undefined) {
    extracted._id = doc._id
  }
  if (doc._rev !== undefined) {
    extracted._rev = doc._rev
  }

  // Collect all fields that need to be preserved for nested population
  const requiredForPopulation = new Set<string>()
  if (populateConfig) {
    for (const fieldName of Object.keys(populateConfig)) {
      requiredForPopulation.add(fieldName)
    }
  }

  // Extract specified fields
  for (const fieldPath of fields) {
    const value = getNestedValue(doc, fieldPath)
    if (value !== undefined) {
      setNestedValue(extracted, fieldPath, value)
    }
  }

  // Also include fields required for nested population that weren't explicitly requested
  // These will be cleaned up after nested population is complete
  for (const fieldName of requiredForPopulation) {
    if (!fields.includes(fieldName)) {
      const value = getNestedValue(doc, fieldName)
      if (value !== undefined) {
        setNestedValue(extracted, fieldName, value)
      }
    }
  }

  return extracted
}

/**
 * Remove fields that were only needed for nested population
 */
function cleanupPopulateFields(
  doc: Record<string, unknown>,
  fields?: string[],
  populateConfig?: PopulateConfig,
): Record<string, unknown> {
  // If no fields specified, return the entire document
  if (!fields || fields.length === 0 || !populateConfig) {
    return doc
  }

  const cleaned = { ...doc }

  // Remove fields that were only added for nested population
  for (const fieldName of Object.keys(populateConfig)) {
    if (!fields.includes(fieldName)) {
      delete cleaned[fieldName]
    }
  }

  return cleaned
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
            // Extract only specified fields if configured
            const processedDoc = extractFields(
              referencedDoc,
              fieldConfig.fields,
              fieldConfig.populate,
            )
            // Use setNestedValue to support nested 'as' paths
            setNestedValue(populatedDoc, fieldConfig.as, processedDoc)
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

    // Clean up temporary fields that were only needed for nested population
    const finalPopulatedDocuments = nestedPopulatedDocuments.map(doc => {
      let cleanedDoc = doc
      for (const [, fieldConfig] of Object.entries(populateConfig)) {
        if (fieldConfig.fields) {
          // Clean up the populated document at the nested path
          const populatedField = getNestedValue(cleanedDoc, fieldConfig.as)
          if (populatedField) {
            const cleanedField = cleanupPopulateFields(
              populatedField as Record<string, unknown>,
              fieldConfig.fields,
              fieldConfig.populate,
            )
            cleanedDoc = { ...cleanedDoc }
            setNestedValue(cleanedDoc, fieldConfig.as, cleanedField)
          }
        }
      }
      return cleanedDoc
    })

    // Performance monitoring in development
    if (process.env.NODE_ENV === 'development') {
      const duration = Date.now() - startTime
      const fieldNames = Object.keys(populateConfig)
      const depthInfo =
        currentDepth > 0 ? ` (depth ${currentDepth}/${maxDepth})` : ''
      const refsInfo =
        referenceIds.size > 0
          ? ` fetched ${referenceIds.size} refs`
          : ' no refs'
      const optionsInfo = []

      // Include relevant options in debug output
      if (options.maxDepth !== undefined && options.maxDepth !== 3) {
        optionsInfo.push(`maxDepth: ${options.maxDepth}`)
      }
      if (visited.size > 0) {
        optionsInfo.push(`visited: ${visited.size}`)
      }

      const optionsSuffix =
        optionsInfo.length > 0 ? ` (${optionsInfo.join(', ')})` : ''

      console.debug(
        `Populate [${fieldNames.join(', ')}] took ${duration}ms for ${
          documents.length
        } docs${depthInfo},${refsInfo}${optionsSuffix}`,
      )
    }

    return finalPopulatedDocuments
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Populate: Error during population:', error)
    }
    return documents // Return original documents on error
  }
}
