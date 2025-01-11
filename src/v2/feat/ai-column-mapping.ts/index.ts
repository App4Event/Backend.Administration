import { generateColumnMappingWithOpenAI } from '../../ai/column-mapping'
import { airtable } from '../../airtable'
import { httpApi, HttpApiFetch } from '../../http-api'
import { App } from 'firebase-admin/app'
import { firestoreAiCache } from './firestore-ai-cache'

const getCachedValue = <
  TConf extends Configured,
  TTable extends keyof TConf['description'],
  TField extends keyof TConf['description'][TTable]
>(
  conf: TConf,
  table: TTable,
  field: TField
) => {
  return conf.cache.getFieldTranslation(table as string, field as string)
}

const configure = <T extends { [Key in string]: Record<string, string> }>(
  description: T,
  airtableApiKey: string,
  baseId: string,
  openaiApiKey: string
) => {
  return {
    description,
    airtableApiKey,
    baseId,
    openaiApiKey,
    cache: new Cache(),
  }
}

class Cache extends Map<string, string> {
  public setFieldTranslation(
    table: string,
    field: string,
    translation: string
  ) {
    this.set(`${table}:${field}`, translation)
  }

  public getFieldTranslation(table: string, field: string) {
    return this.get(`${table}:${field}`)
  }
}

type Configured = ReturnType<typeof configure>

export type WarmupOptions = {
  generateColumnMappingWithAI?: typeof generateColumnMappingWithOpenAI
  fetch?: typeof httpApi.request
  fetchBaseSchema?: typeof airtable.fetchBaseSchema
  aiCache?: typeof firestoreAiCache
}

const generateMapping = async (
  aiCache: typeof firestoreAiCache | undefined,
  fetch: HttpApiFetch,
  openaiApiKey: string,
  generateColumnMappingWithAI: typeof generateColumnMappingWithOpenAI,
  tableFields: string[],
  fields: Record<string, string>
) => {
  if (!aiCache) {
    return generateColumnMappingWithAI(fetch, openaiApiKey, tableFields, fields)
  }
  const cached = await aiCache.getAIResult(aiCache.getApp(), tableFields, fields)
  if (cached) {
    return cached
  }
  const mapping = await generateColumnMappingWithAI(
    fetch,
    openaiApiKey,
    tableFields,
    fields
  )
  await aiCache.setAIResult(aiCache.getApp(), tableFields, fields, mapping)
  return mapping
}


const warmupCache = async (conf: Configured, options?: WarmupOptions) => {
  const {
    fetch = httpApi.request,
    fetchBaseSchema = airtable.fetchBaseSchema,
    generateColumnMappingWithAI = generateColumnMappingWithOpenAI,
    aiCache,
  } = options ?? {}
  const tableSchema = await fetchBaseSchema(
    fetch,
    conf.airtableApiKey,
    conf.baseId
  )
  await Promise.all(
    Object.entries(conf.description).map(async ([tableName, fields]) => {
      const table = tableSchema.tables.find(x => x.name === tableName)
      if (!table) {
        return
      }
      const tableFields = table.fields.map(x => x.name)
      const mapping = await generateMapping(
        aiCache,
        fetch,
        conf.openaiApiKey,
        generateColumnMappingWithAI,
        tableFields,
        fields
      )
      Object.keys(fields).forEach(field => {
        conf.cache.setFieldTranslation(tableName, field, mapping[field])
      })
    })
  )
}

export const aiColumnMapping = {
  configure,
  warmupCache,
  getCachedValue,
  firestoreAiCache,
}
