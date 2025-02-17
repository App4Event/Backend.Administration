import { App } from 'firebase-admin/app'
import { firestore } from '../firestore'
import { EtlEvents } from './events'
import * as firestoreSchema from './firestore-schema'
import { ImportPerformer } from './input-interfaces'
import { loadPerformersToAbstractFirestore } from './load-performers'
import { Transformed } from './transform'

export type EntityLoader<T> = (add: (item: T) => Promise<void>) => Promise<void>

export type FirestoreEntity<T> = {
  path: string
  document: T
}
export type FirestorePerformer = FirestoreEntity<firestoreSchema.components['schemas']['Performer']>

export const loadToFirestore = async (
  app: App,
  transformedEntities: Transformed,
  events?: EtlEvents
) => {
  await loadToAbstractFirestore(
    {
      saveMany: async (entities) => {
        await firestore.setDocuments(app, entities.map(e => ({ path: e.path, value: e.document })))
      },
    },
    transformedEntities,
    events
  )
}

export interface AbstractFirestore {
  saveMany: (entities: FirestoreEntity<any>[]) => Promise<void>
}

export const SAVE_BUFFER_SIZE = 100

export const bufferedSave = async (
  store: AbstractFirestore,
  buffer: FirestoreEntity<any>[],
  entity: FirestoreEntity<any>,
  size: number = SAVE_BUFFER_SIZE
) => {
  buffer.push(entity)
  if (buffer.length >= size) {
    await store.saveMany(buffer)
    buffer.length = 0
  }
}

export const flushSaveBuffer = async (store: AbstractFirestore, buffer: FirestoreEntity<any>[]) => {
  if (buffer.length > 0) {
    await store.saveMany(buffer)
    buffer.length = 0
  }
}

export const emptyRejectionReport = <TSample, TReason extends string | number | symbol>() => ({
  samples: [] as Array<[TSample, TReason]>,
  totals: {} as Record<TReason, number>
})

type RejectionReport<
  TSample,
  TReason extends string | number | symbol,
> = ReturnType<typeof emptyRejectionReport<TSample, TReason>>

export const collectRejection = async <
  TSample,
  TReason extends string | number | symbol,
>(
  report: RejectionReport<TSample, TReason>,
  entity: TSample,
  reason: TReason
) => {
  report.totals[reason] = (report.totals[reason] ?? 0) + 1
  if (report.totals[reason] === 1) {
    report.samples.push([entity, reason])
  }
}

export const loadToAbstractFirestore = async (
  store: AbstractFirestore,
  transformedEntities: Transformed,
  events?: EtlEvents
) => {
  events?.onLoadStarted?.()
  events?.onLoadProgress?.('Loading Performers...')
  await loadPerformersToAbstractFirestore(store, transformedEntities.performers)
  events?.onLoadComplete?.()
}
