import * as firebaseAdmin from 'firebase-admin'
import * as lodash from 'lodash'
import * as util from './util'

export const connectFirestore = () => {
  const f = new firebaseAdmin.firestore.Firestore()
  return {
    firestore: f,
  }
}

type FirestoreConnection = ReturnType<typeof connectFirestore>

export const path = {
  '/languages/{lang}/': ({ lang }: { lang: string }) => '/languages/{lang}/'.replace('{lang}', lang),
  '/languages/{lang}/performers/{id}': ({ lang, id }: { lang: string; id: string; }) => '/languages/{lang}/performers/{id}'
    .replace('{lang}', lang)
    .replace('{id}', id),
    '/languages/{lang}/venues/{id}': ({ lang, id }: { lang: string; id: string; }) => '/languages/{lang}/venues/{id}'
      .replace('{lang}', lang)
      .replace('{id}', id),
    '/languages/{lang}/sessions/{id}': ({ lang, id }: { lang: string; id: string; }) => '/languages/{lang}/sessions/{id}'
      .replace('{lang}', lang)
      .replace('{id}', id),
  '/imports': () => 'imports',
  '/imports/{id}': ({ id }: { id: string }) => '/imports/{id}'.replace('{id}', id),
}

export const save = async (conn: FirestoreConnection, path: string, doc: any) => {
  const cleanedDoc = lodash.omitBy(doc, lodash.isUndefined)
  if (lodash.isEmpty(cleanedDoc)) return
  await conn.firestore.doc(path).set(cleanedDoc, { merge: true })
}

/**
 * Converts given keys in given object to Firestore specific structures.
 * Like GeoPoint, dates etc.
 * @param item
 * @param settings
 * @returns
 */
export const convertFirstoreKeys = <TItem extends Record<string, any>, TKey extends keyof TItem>(item: TItem, settings: {
  dates: TKey[]
}) => {
  // TBA: Geolocation overrides
  const datesOverride = settings.dates.reduce((override, prop) => {
    return {
      ...override,
      [prop]: util.createDate(item[prop]),
    }
  }, {})
  return {
    ...item,
    ...datesOverride,
  }
}