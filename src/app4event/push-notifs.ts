import * as firebaseAdmin from 'firebase-admin'
import * as entity from '../app4event/entity'
import * as util from './util'
import * as firestore from './firestore'

firebaseAdmin.apps.length === 0 && firebaseAdmin.initializeApp()

export const probe = util.createDomainProbe({
  newsCreated: (e: { id: string; languageCode: string; data: any }) => e,
  noPushDueToEmptyData: () => undefined,
  notificationSent: (e: {
    languageCode: string
    request: firebaseAdmin.messaging.Message
  }) => e,
  delayedNewsPublished: (e: { titles: string[] }) => e,
})

export const onNewsCreated = async (
  id: string,
  languageCode: string,
  news: entity.News
) => {
  probe.newsCreated({ id, languageCode, data: news })
  const request: firebaseAdmin.messaging.Message = {
    data: {
      newsId: id,
    },
    android: {
      notification: {
        defaultSound: true,
      },
    },
    notification: {
      title: news?.title ?? '',
      body: news?.body ?? '',
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
        },
      },
    },
    topic: languageCode,
  }
  if (!languageCode || !news.title) {
    probe.noPushDueToEmptyData()
    return
  }
  await firebaseAdmin.messaging().send(request)
  probe.notificationSent({ languageCode, request })
}

type ListedDelayedNews = entity.DelayedNews & {
  language: string
  id: string
  firestorePath: string
}

const listToBePublishedNews = async (
  f: firestore.FirestoreConnection,
  languages: string[]
) => {
  return (
    await Promise.all(
      languages.map(async language => {
        const result = await f.firestore
          .collection(
            firestore.path['/languages/{lang}/newsDelayed']({ lang: language })
          )
          .where('time', '<=', new Date())
          // Would be really nice to have this in the query, but it requires manual creation
          // for each project https://firebase.google.com/docs/firestore/query-data/indexing#exemptions
          // .where('publishError', '==', null)
          .get()
        if (result.empty) {
          return []
        }
        return result.docs.map(
          (x): ListedDelayedNews => {
            const data: Partial<entity.DelayedNews> = firestore.revertFirestoreKeys(
              x.data(),
              { dates: ['time'] }
            )
            return {
              language,
              firestorePath: x.ref.path,
              isListed: data.isListed,
              body: data.body ?? '',
              id: x.id,
              publishError: data.publishError,
              time: data.time,
              title: data.title ?? '',
            }
          }
        )
      })
    )
  ).flatMap(x => x)
}

const publishDelayedNewsList = async (
  f: firestore.FirestoreConnection,
  items: ListedDelayedNews[]
) => {
  if (!items.length) {
    return
  }
  const batch = f.firestore.batch()
  const state = {
    published: 0,
    failed: 0,
    failures: [] as Array<{ id: string; error: Error }>,
  }
  items.forEach(item => {
    let publishError: string
    try {
      const id = item.id
      const news: entity.News = {
        id,
        body: item.body,
        time: item.time,
        title: item.title,
        isListed: item.isListed ?? null!,
      }
      batch.set(
        f.firestore.doc(
          firestore.path['/languages/{lang}/news/{id}']({
            id,
            lang: item.language,
          })
        ),
        firestore.convertFirstoreKeys(news, { dates: ['time'] })
      )
      batch.delete(f.firestore.doc(item.firestorePath))
      state.published += 1
    } catch (error) {
      publishError = error instanceof Error ? error.message : String(error)
      state.failures.push({
        error: error instanceof Error ? error : new Error(String(error)),
        id: item.id,
      })
      state.failed += 1
      batch.update(f.firestore.doc(item.id), { ...item, publishError })
    }
  })
  await batch.commit()
  probe.delayedNewsPublished({ titles: items.map(x => x.title ?? '') })
  return state
}

/**
 * @param languages List of languages to publish news for
 */
export const publishDelayedNews = async (languages: string[]) => {
  const conn = firestore.connectFirestore()
  const items = await listToBePublishedNews(conn, languages)
  await publishDelayedNewsList(conn, items)
}
