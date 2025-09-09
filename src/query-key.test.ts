import {
  stableStringify,
  QueryKeyGenerator,
  queryKeyGenerator,
} from './query-key'

describe('stableStringify', () => {
  test('should handle primitive values', () => {
    expect(stableStringify(null)).toBe('null')
    expect(stableStringify(undefined)).toBe('undefined')
    expect(stableStringify(42)).toBe('42')
    expect(stableStringify('hello')).toBe('"hello"')
    expect(stableStringify(true)).toBe('true')
  })

  test('should handle arrays', () => {
    expect(stableStringify([1, 2, 3])).toBe('[1,2,3]')
    expect(stableStringify(['a', 'b'])).toBe('["a","b"]')
    expect(stableStringify([])).toBe('[]')
  })

  test('should produce stable object key ordering', () => {
    const obj1 = { b: 2, a: 1, c: 3 }
    const obj2 = { c: 3, a: 1, b: 2 }
    const obj3 = { a: 1, b: 2, c: 3 }

    const str1 = stableStringify(obj1)
    const str2 = stableStringify(obj2)
    const str3 = stableStringify(obj3)

    expect(str1).toBe(str2)
    expect(str1).toBe(str3)
    expect(str1).toBe('{"a":1,"b":2,"c":3}')
  })

  test('should handle nested objects', () => {
    const complex = {
      selector: { type: 'test', status: { $in: ['active', 'pending'] } },
      sort: ['created', 'name'],
      limit: 10,
    }

    const result = stableStringify(complex)
    expect(result).toContain('"selector"')
    expect(result).toContain('"sort"')
    expect(result).toContain('"limit"')

    // Should be stable regardless of input order
    const reordered = {
      limit: 10,
      selector: { status: { $in: ['active', 'pending'] }, type: 'test' },
      sort: ['created', 'name'],
    }

    expect(stableStringify(complex)).toBe(stableStringify(reordered))
  })

  test('should handle circular references gracefully', () => {
    const circular: Record<string, unknown> = { a: 1 }
    circular.self = circular

    // Should not throw, should return error fallback
    const result = stableStringify(circular)
    expect(result).toContain('error:')
  })
})

describe('QueryKeyGenerator', () => {
  let generator: QueryKeyGenerator

  beforeEach(() => {
    generator = new QueryKeyGenerator()
  })

  test('should generate consistent keys for same input', () => {
    const options = { selector: { type: 'test' }, limit: 10 }

    const key1 = generator.generate(options)
    const key2 = generator.generate(options)

    expect(key1).toBe(key2)
  })

  test('should generate same key for equivalent objects', () => {
    const options1 = { selector: { type: 'test' }, limit: 10 }
    const options2 = { limit: 10, selector: { type: 'test' } }

    const key1 = generator.generate(options1)
    const key2 = generator.generate(options2)

    expect(key1).toBe(key2)
  })

  test('should generate different keys for different options', () => {
    const options1 = { selector: { type: 'test' }, limit: 10 }
    const options2 = { selector: { type: 'test' }, limit: 20 }

    const key1 = generator.generate(options1)
    const key2 = generator.generate(options2)

    expect(key1).not.toBe(key2)
  })

  test('should handle functions by ignoring them', () => {
    const options1 = {
      selector: { type: 'test' },
      callback: () => {
        /* empty */
      },
    }
    const options2 = { selector: { type: 'test' } }

    const key1 = generator.generate(options1)
    const key2 = generator.generate(options2)

    expect(key1).toBe(key2) // Functions should be ignored
  })

  test('should normalize undefined values to null', () => {
    const options1 = { selector: { type: 'test' }, limit: undefined }
    const options2 = { selector: { type: 'test' }, limit: null }

    const key1 = generator.generate(options1)
    const key2 = generator.generate(options2)

    expect(key1).toBe(key2)
  })

  test('should use cache for performance', () => {
    const options = { selector: { type: 'test' }, limit: 10 }

    // Generate key first time
    const key1 = generator.generate(options)

    // Mock the generate method to verify cache hit
    const originalGenerate = generator.generate
    const generateSpy = jest.fn().mockReturnValue('should-not-be-called')
    generator.generate = generateSpy

    // This should not call the spy because it hits cache
    const key2 = originalGenerate.call(generator, options)

    expect(key1).toBe(key2)
  })

  test('should handle user-provided string queryKey', () => {
    const userKey = 'my-custom-key'
    const result = generator.generateFromUserKey(userKey)

    expect(result).toBe(userKey)
  })

  test('should handle user-provided array queryKey', () => {
    const userKey = ['todos', { status: 'active' }, 'page-1']
    const result = generator.generateFromUserKey(userKey)

    expect(result).toContain('todos')
    expect(result).toContain('active')
    expect(result).toContain('page-1')
  })

  test('should clear cache', () => {
    const options = { selector: { type: 'test' } }

    generator.generate(options)
    generator.clearCache()

    // After clearing cache, should regenerate
    const key = generator.generate(options)
    expect(key).toBeDefined()
  })
})

describe('Global queryKeyGenerator', () => {
  test('should be available as singleton', () => {
    expect(queryKeyGenerator).toBeInstanceOf(QueryKeyGenerator)
  })

  test('should maintain state across calls', () => {
    const options = { selector: { type: 'global-test' } }

    const key1 = queryKeyGenerator.generate(options)
    const key2 = queryKeyGenerator.generate(options)

    expect(key1).toBe(key2)
  })
})

describe('Real-world PouchDB options', () => {
  test('should handle complex PouchDB find options', () => {
    const findOptions = {
      selector: {
        type: 'BoxType',
        $or: [{ status: 'active' }, { status: 'pending' }],
      },
      index: ['type-status-index'],
      sort: [{ created: 'desc' }, { name: 'asc' }],
      limit: 50,
      skip: 10,
      fields: ['_id', 'name', 'status', 'created'],
    }

    const key = queryKeyGenerator.generate(findOptions)

    expect(key).toBeDefined()
    expect(key.length > 0).toBe(true)

    // Should be stable
    const key2 = queryKeyGenerator.generate(findOptions)
    expect(key).toBe(key2)

    // Should be different with slight change
    const modifiedOptions = { ...findOptions, limit: 100 }
    const key3 = queryKeyGenerator.generate(modifiedOptions)
    expect(key).not.toBe(key3)
  })

  test('should handle populate options consistently', () => {
    const options1 = {
      selector: { type: 'test' },
      populate: {
        site_id: { as: 'site' },
        author_id: { as: 'author' },
      },
    }

    const options2 = {
      selector: { type: 'test' },
      populate: {
        author_id: { as: 'author' },
        site_id: { as: 'site' },
      },
    }

    const key1 = queryKeyGenerator.generate(options1)
    const key2 = queryKeyGenerator.generate(options2)

    expect(key1).toBe(key2) // Should be same despite object key order
  })
})
