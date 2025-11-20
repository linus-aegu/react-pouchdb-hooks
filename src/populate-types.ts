/**
 * Configuration for populating a single field
 */
export interface PopulateFieldConfig {
  /** Field name where the populated document will be stored */
  as: string
  /** Database name if different from current (optional) */
  db?: string
  /** Nested populate configuration for the populated document (recursive) */
  populate?: PopulateConfig
  /**
   * Array of field names to include from the populated document.
   * Supports nested field paths using dot notation (e.g., 'address.city').
   * If not specified, the entire document is included.
   * Special fields (_id, _rev) are always included for document integrity.
   */
  fields?: string[]
  /**
   * Custom query function for non-_id lookups (foreign key support).
   * When provided, uses indexed db.find() instead of direct allDocs() lookup.
   *
   * @param values - Array of reference values from source documents
   * @returns Query configuration for db.find()
   *
   * @example
   * // Populate by indexed field instead of _id
   * query: (values) => ({
   *   selector: { cultivar_base_code: { $in: values } },
   *   use_index: ['ddoc_cultivar', 'idx_cultivar_base_code']
   * })
   */
  query?: (values: string[]) => {
    selector: PouchDB.Find.Selector
    limit?: number
    use_index?: string | [string, string]
  }
}

/**
 * Configuration object for populate functionality
 * Key = field name containing reference ID
 * Value = configuration for how to populate that field
 */
export interface PopulateConfig {
  [fieldName: string]: PopulateFieldConfig
}

/**
 * Type helper for adding populated fields to a document type
 */
export type PopulatedDocument<T, P extends PopulateConfig> = T & {
  [K in keyof P as P[K]['as']]: unknown
}

/**
 * Extended options interface that includes populate functionality
 */
export interface PopulateOptions {
  /** Optional populate configuration */
  populate?: PopulateConfig
  /** Maximum recursion depth for nested populates (default: 3) */
  maxDepth?: number
  /** Internal: Set of visited document IDs to prevent circular references */
  _visited?: Set<string>
  /** Internal: Current recursion depth */
  _currentDepth?: number
}
