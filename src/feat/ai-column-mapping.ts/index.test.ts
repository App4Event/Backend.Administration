import test, { describe } from 'node:test'
import { aiColumnMapping } from '.'
import { deepEqual, equal } from 'node:assert'

describe('feat/ai-column-mapping', () => {
  test('warmupCache fills the cache with found mappings', async t => {
    const conf = aiColumnMapping.configure(
      {
        Performers: {
          'name.cs': 'Name of a performer in Czech language.',
          'name.en': 'Name of a performer in English language.',
        },
      },
      'apikey',
      'baseid',
      'openaiapikey'
    )
    const mockFindMapping = t.mock.fn(() =>
      Promise.resolve({
        'name.cs': 'Name CS',
        'name.en': 'Name EN',
      })
    )
    const mockFetchBaseSchema = t.mock.fn(() =>
      Promise.resolve({
        tables: [
          {
            name: 'Performers',
            fields: [{ name: 'Name CS' }, { name: 'Name EN' }],
          },
        ],
      })
    )
    await aiColumnMapping.warmupCache(conf, {
      generateColumnMappingWithAI: mockFindMapping,
      fetchBaseSchema: mockFetchBaseSchema,
    })
    equal(mockFindMapping.mock.calls.length, 1)
    equal(mockFindMapping.mock.calls[0].arguments.at(1), 'openaiapikey')
    deepEqual(mockFindMapping.mock.calls[0].arguments.at(2), [
      'Name CS',
      'Name EN',
    ])
    deepEqual(mockFindMapping.mock.calls[0].arguments.at(3), {
      'name.cs': 'Name of a performer in Czech language.',
      'name.en': 'Name of a performer in English language.',
    })
    equal(conf.cache.getFieldTranslation('Performers', 'name.cs'), 'Name CS')
    equal(conf.cache.getFieldTranslation('Performers', 'name.en'), 'Name EN')
  })
  test('Cache warmup does not call findMapping (AI) for subsequent calls for the same columns', async t => {
    const conf = aiColumnMapping.configure(
      {
        Table: {
          column: 'column description',
        },
      },
      'apikey',
      'baseid',
      'openaiapikey'
    )
    const mockFetchBaseSchema = t.mock.fn(async () => ({
      tables: [
        {
          name: 'Table',
          fields: [{ name: 'Column' }],
        },
      ],
    }))

    const mockFindMapping = t.mock.fn(() =>
      Promise.resolve({
        'a.1': 'A 1',
        'a.2': 'A 2',
      })
    )
    await aiColumnMapping.warmupCache(conf, {
      generateColumnMappingWithAI: mockFindMapping,
      fetchBaseSchema: mockFetchBaseSchema,
    })
    equal(mockFindMapping.mock.calls.length, 1)
    const mockAiFirestoreCache = {
      getApp: () => ({} as any),
      getKey: () => 'key',
      setAIResult: async () => {},
      getAIResult: async () => ({}),
    }
    await aiColumnMapping.warmupCache(conf, {
      generateColumnMappingWithAI: mockFindMapping,
      fetchBaseSchema: mockFetchBaseSchema,
      aiCache: mockAiFirestoreCache,
    })
    equal(mockFindMapping.mock.calls.length, 1)
  })
})
