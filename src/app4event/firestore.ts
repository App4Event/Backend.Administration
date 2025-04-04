import * as firebaseAdmin from 'firebase-admin'
import * as lodash from 'lodash'
import * as util from './util'

export const connectFirestore = () => {
  const f = new firebaseAdmin.firestore.Firestore()
  return {
    firestore: f,
  }
}

export type FirestoreConnection = ReturnType<typeof connectFirestore>

export const path = {
  '/languages/{lang}/': ({ lang }: { lang: string }) =>
    '/languages/{lang}/'.replace('{lang}', lang),
  '/languages/{lang}/performers': ({ lang }: { lang: string }) =>
    '/languages/{lang}/performers'.replace('{lang}', lang),
  '/languages/{lang}/sessions': ({ lang }: { lang: string }) =>
    '/languages/{lang}/sessions'.replace('{lang}', lang),
  '/languages/{lang}/venues': ({ lang }: { lang: string }) =>
    '/languages/{lang}/venues'.replace('{lang}', lang),
  '/languages/{lang}/days': ({ lang }: { lang: string }) =>
    '/languages/{lang}/days'.replace('{lang}', lang),
  '/languages/{lang}/groups': ({ lang }: { lang: string }) =>
    '/languages/{lang}/groups'.replace('{lang}', lang),
  '/languages/{lang}/performers/{id}': ({
    lang,
    id,
  }: {
    lang: string
    id: string
  }) =>
    '/languages/{lang}/performers/{id}'
      .replace('{lang}', lang)
      .replace('{id}', id),
  '/languages/{lang}/venues/{id}': ({
    lang,
    id,
  }: {
    lang: string
    id: string
  }) =>
    '/languages/{lang}/venues/{id}'.replace('{lang}', lang).replace('{id}', id),
  '/languages/{lang}/sessions/{id}': ({
    lang,
    id,
  }: {
    lang: string
    id: string
  }) =>
    '/languages/{lang}/sessions/{id}'
      .replace('{lang}', lang)
      .replace('{id}', id),
  '/languages/{lang}/days/{id}': ({ lang, id }: { lang: string; id: string }) =>
    '/languages/{lang}/days/{id}'.replace('{lang}', lang).replace('{id}', id),
  '/languages/{lang}/groups/{id}': ({
    lang,
    id,
  }: {
    lang: string
    id: string
  }) =>
    '/languages/{lang}/groups/{id}'.replace('{lang}', lang).replace('{id}', id),
  '/languages/{lang}/groups/{groupId}/items/{id}': ({
    lang,
    id,
    groupId,
  }: {
    groupId: string
    lang: string
    id: string
  }) =>
    '/languages/{lang}/groups/{groupId}/items/{id}'
      .replace('{lang}', lang)
      .replace('{id}', id)
      .replace('{groupId}', groupId),
  '/imports': () => 'imports',
  '/imports/{id}': ({ id }: { id: string }) =>
    '/imports/{id}'.replace('{id}', id),
  '/imports/{id}/logs': ({ id }: { id: string }) =>
    '/imports/{id}/logs'.replace('{id}', id),
  '/languages/{lang}/newsDelayed': ({ lang }: { lang: string }) =>
    `/languages/${lang}/newsDelayed`,
  '/languages/{lang}/news': ({ lang }: { lang: string }) =>
    `/languages/${lang}/news`,
  '/languages/{lang}/news/{id}': ({ lang, id }: { lang: string; id: string }) =>
    `/languages/${lang}/news/${id}`,
  '/languages/{lang}/venueCategories': ({ lang }: { lang: string }) =>
    `/languages/${lang}/venueCategories`,
  '/languages/{lang}/venueCategories/{id}': ({
    lang,
    id,
  }: {
    lang: string
    id: string
  }) => `/languages/${lang}/venueCategories/${id}`,
  '/languages/{lang}/highlights': ({ lang }: { lang: string }) =>
    `/languages/${lang}/highlights`,
  '/languages/{lang}/highlights/{id}': ({
    lang,
    id,
  }: {
    lang: string
    id: string
  }) => `/languages/${lang}/highlights/${id}`,
}

export const save = async (conn: FirestoreConnection, path: string, doc: any) => {
  const cleanedDoc = lodash.omitBy(doc, lodash.isUndefined)
  if (lodash.isEmpty(cleanedDoc)) return
  await conn.firestore.doc(path).set(cleanedDoc, { merge: true })
}

export const add = async (conn: FirestoreConnection, path: string, doc: any) => {
  const cleanedDoc = lodash.omitBy(doc, lodash.isUndefined)
  if (lodash.isEmpty(cleanedDoc)) return
  await conn.firestore.collection(path).add(doc)
}

export const getCollectionDocumentIds = async (conn: FirestoreConnection, collectionName: string) => {
  const collection = conn.firestore.collection(collectionName)
  const limit = 50
  let lastItem: firebaseAdmin.firestore.QueryDocumentSnapshot | undefined
  const ids: string[] = []
  do {
    let query = collection.limit(limit)
    if (lastItem) query = query.startAfter(lastItem)
    const result = await query.get()
    lastItem = result.docs.slice(-1)[0]
    result.docs.forEach(doc => {
      ids.push(doc.id)
    })
  } while (lastItem)
  return {
    ids,
  }
}

/**
 * Converts given keys in given object to Firestore specific structures.
 * Like GeoPoint, dates etc.
 * @param item
 * @param settings
 * @returns
 */
export const convertFirstoreKeys = <TItem extends Record<string, any>, TKey extends keyof TItem>(item: TItem, settings: {
  dates?: TKey[];
  geoPoints?: TKey[];
}) => {
  const gpsOverride = settings.geoPoints?.reduce((override, prop) => {
    return {
      ...override,
      [prop]: objectToGeo(item[prop]),
    }
  }, {})
  const datesOverride = settings.dates?.reduce((override, prop) => {
    const date = util.createDate(item[prop])
    return {
      ...override,
      [prop]: date ? firebaseAdmin.firestore.Timestamp.fromDate(date) : null,
    }
  }, {})
  return {
    ...item,
    ...datesOverride,
    ...gpsOverride,
  }
  function objectToGeo(object?: { lat: any, lng: any }) {
    if (!object) return null
    if (isNaN(Number(object.lat)) || isNaN(Number(object.lng))) {
      return null
    }
    const lat = Number(object.lat)
    const lng = Number(object.lng)
    return new firebaseAdmin.firestore.GeoPoint(lat, lng)
  }
}

export const revertFirestoreKeys = <TItem extends Record<string, any>, TKey extends keyof TItem>(item: TItem, settings: {
  dates: TKey[]
}) => {
  // TBA: Geolocation overrides
  const datesOverride = settings.dates.reduce((override, prop) => {
    return {
      ...override,
      [prop]: (item[prop] as firebaseAdmin.firestore.Timestamp)?.toDate?.() ?? null,
    }
  }, {})
  return {
    ...item,
    ...datesOverride,
  }
}

export const deleteCollectionDocumentsByIds = async (conn: FirestoreConnection, collectionName: string, ids: string[]) => {
  await util.chunk(ids, 100)
    .reduce(async (last, ids) => {
      await last
      const batch = conn.firestore.batch()
      ids.forEach(id => {
        batch.delete(conn.firestore.doc(`${collectionName}/${id}`))
      })
      await batch.commit()
    }, Promise.resolve())
}
