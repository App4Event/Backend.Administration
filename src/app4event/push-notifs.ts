import * as firebaseAdmin from 'firebase-admin'
import * as entity from '../app4event/entity'
import * as util from './util'

export const probe = util.createDomainProbe({
    newsCreated: (e: { id: string, languageCode: string, data: any }) => e,
    noPushDueToEmptyData: () => undefined,
    notificationSent: (e: { languageCode: string, request: firebaseAdmin.messaging.MessagingPayload }) => e,
})

export const onNewsCreated = async (id: string, languageCode: string, news: entity.News) => {
    probe.newsCreated({ id, languageCode, data: news })
    const request: firebaseAdmin.messaging.MessagingPayload = {
        data: {
            newsId: id,
        },
        notification: {
            title: news?.title ?? '',
            body: news?.body ?? '',
            sound: 'default',
        },
    }
    if (!languageCode || !news.title) {
        probe.noPushDueToEmptyData()
        return
    }
    await firebaseAdmin.messaging().sendToTopic(languageCode, request)
    probe.notificationSent({ languageCode, request })
}
