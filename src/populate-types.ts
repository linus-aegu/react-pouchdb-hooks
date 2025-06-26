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
