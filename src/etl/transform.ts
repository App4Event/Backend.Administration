import { EtlEvents } from './events'
import { firestorePath } from './firestore-path'
import {
  ImportCustomRecord,
  ImportEntity,
  ImportLocalizedEntity,
  ImportPerformer,
} from './input-interfaces'
import { FirestoreEntity } from './load'

export interface TransformedEntity extends ImportEntity<any> {
  warning?: string
  error?: string
}

export interface TransformContext {
  addPerformer: (entity: ImportPerformer) => Promise<void>
  addCustomEntity: (entity: ImportCustomRecord) => Promise<void>
}

const push = async (
  collection: FirestoreEntity<any>[],
  entity: FirestoreEntity<any>
) => {
  collection.push(entity)
  await new Promise(setImmediate)
}

export const transform = async (
  transform: (t: TransformContext) => Promise<void>,
  events?: EtlEvents
): Promise<FirestoreEntity<any>[]> => {
  const results: FirestoreEntity<any>[] = []
  events?.onTransformStarted()
  await transform({
    addPerformer: (x) =>
      push(results, {
        path: firestorePath.performer(x.language, x.id),
        document: x,
      }),
    addCustomEntity: (x) => push(results, x),
  })
  events?.onTransformComplete()
  return results
}
