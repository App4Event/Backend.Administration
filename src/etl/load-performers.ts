import { ImportPerformer } from './input-interfaces'
import { AbstractFirestore, bufferedSave, collectRejection, emptyRejectionReport, EntityLoader, FirestoreEntity, FirestorePerformer, flushSaveBuffer } from './load'

export enum PerformerRejectionReason {
  Invalid,
}

const loadPerformers = async (
  loader: EntityLoader<ImportPerformer>,
  load: (performer: FirestorePerformer, originalPerformer: ImportPerformer) => Promise<void>,
  reject: (performer: ImportPerformer, reason: PerformerRejectionReason) => Promise<void>
) => {
  await loader(async (performer) => {
    // TODO Find references
    // TODO Validate
    await load(
      {
        document: {
          id: performer.id,
          name: performer.data.name || '',
          public: true,
        },
        path: `performers/${performer.id}`,
      },
      performer
    )
  })
}

export const loadPerformersToAbstractFirestore = async (
  store: AbstractFirestore,
  loader: EntityLoader<ImportPerformer>
) => {
  const buffer: FirestoreEntity<any>[] = []
  const rejections = emptyRejectionReport<ImportPerformer, PerformerRejectionReason>()
  await loadPerformers(
    loader,
    x => bufferedSave(store, buffer, x),
    (x, r) => collectRejection(rejections, x, r)
  )
  await flushSaveBuffer(store, buffer)
}