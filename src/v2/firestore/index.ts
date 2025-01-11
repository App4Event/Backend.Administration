import * as admin from 'firebase-admin'
import { App } from 'firebase-admin/app'
import { DocumentData, getFirestore, Timestamp } from 'firebase-admin/firestore'

const getApp = () => {
  return admin.apps[0] ?? admin.initializeApp()
}

type Document = Record<
  string,
  | string
  | number
  | boolean
  | null
  | Date
  | Array<string | number | boolean | Date>
  | Record<string, string | number | boolean | Date>
>

const setDocument = async (app: App, path: string, value: Document) => {
  await getFirestore(app).doc(path).set(serialize(value))
}

const serialize = (value: unknown): DocumentData => {
  if (value instanceof Date) {
    return Timestamp.fromDate(value)
  }
  if (Array.isArray(value)) {
    return value.map(serialize)
  }
  if (value instanceof Object && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, value]) => [key, serialize(value)])
    )
  }
  return value as DocumentData
}

const deserialize = (
  value?: DocumentData
): undefined | Document[keyof Document] => {
  if (!value) {
    return undefined
  }
  if (value instanceof Timestamp) {
    return value.toDate()
  }
  if (Array.isArray(value)) {
    return value.map(deserialize) as Document[keyof Document]
  }
  if (value instanceof Object && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, value]) => [key, deserialize(value)])
    ) as Document[keyof Document]
  }
  return value as Document[keyof Document]
}

const getDocument = async (app: App, path: string) => {
  const doc = await getFirestore(app).doc(path).get()
  return {
    id: doc.id,
    data: deserialize(doc.data()),
  }
}

export const firestore = {
  setDocument,
  getDocument,
  getApp,
  serialize,
  deserialize,
}
