import { App } from 'firebase-admin/app'
import { firestore } from '../../firestore'

export class CorruptedFirestoreAiCacheEntry extends Error {}

type FirestoreAiCacheEntry = {
  result: Record<string, string>
  tableFields: string[]
  shape: Record<string, string>
  timestamp: Date
}

export const firestoreAiCache = {
  getApp: () => firestore.getApp(),
  getKey: (tableFields: string[], shape: Record<string, string>) => {
    const t = new Date().toISOString().slice(0, 10)
    return `.cache/aicolumnmapping/versions/${t}_${Buffer.from(
      JSON.stringify(tableFields) + JSON.stringify(shape)
    ).toString('base64')}`
  },
  setAIResult: async (
    app: App,
    tableFields: string[],
    shape: Record<string, string>,
    result: Record<string, string>
  ) => {
    const entry: FirestoreAiCacheEntry = {
      result,
      tableFields,
      shape,
      timestamp: new Date(),
    }
    await firestore.setDocument(
      app,
      firestoreAiCache.getKey(tableFields, shape),
      entry
    )
  },
  getAIResult: async (
    app: App,
    tableFields: string[],
    shape: Record<string, string>
  ) => {
    const result = await firestore.getDocument(
      app,
      firestoreAiCache.getKey(tableFields, shape)
    )
    if (!result || !result.data) {
      return
    }
    if (
      typeof result.data === 'object' &&
      Object.keys(result.data).length === 4
    ) {
      return ((result.data as unknown) as FirestoreAiCacheEntry).result
    }
    throw new CorruptedFirestoreAiCacheEntry()
  },
}
