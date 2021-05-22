import * as firebaseAdmin from 'firebase-admin'
import * as events from 'events'

const ee = new events.EventEmitter()

export const newsCreated = (event: { id: string, languageCode: string, data: any}) => ee.emit('newsCreated', event)
export const noPushDueToEmptyData = () => ee.emit('noPushDueToEmptyData')
export const notificationSent = (event: { languageCode: string, request: firebaseAdmin.messaging.MessagingPayload }) => ee.emit('notificationSent', event)

type EventData<T extends (...args: any[]) => any> = Parameters<T>[0]

export function on(e: 'newsCreated', cb: (data: EventData<typeof newsCreated>) => any): void
export function on(e: 'noPushDueToEmptyData', cb: (data: EventData<typeof noPushDueToEmptyData>) => any): void
export function on(e: 'notificationSent', cb: (data: EventData<typeof notificationSent>) => any): void
export function on(e: string, cb: (data: any) => any) {
    return ee.on(e, cb)
}
