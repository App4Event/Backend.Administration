import * as firebaseAdmin from 'firebase-admin'
import * as entity from '../app4event/entity'
import * as probe from './push-notifs-probe'

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
    if (!languageCode || news.title) {
        probe.noPushDueToEmptyData()
        return
    }
    await firebaseAdmin.messaging().sendToTopic(languageCode, request)
    probe.notificationSent({ languageCode, request })
}
