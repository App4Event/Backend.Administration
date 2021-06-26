import * as entity from './entity'
import { EventImporter, Item } from './event-import'
import * as firestore from './firestore'
import * as util from './util'
import * as errors from './errors'
import * as validation from './validation'

export type SavedState = util.Unpromise<ReturnType<typeof saveImporterState>>

export const saveImporterState = async (importer: EventImporter) => {
  const finished = importer.progress >= 1 ||
    // Loading data failure means no data, therefore no import
    !!importer.errors.find(x => x.message === errors.LOADING_DATA_FAILED)
  const progress = finished ? 1 : importer.progress
  const errorSummary = Object.entries(util.countBy(importer.errors, x => x.message))
    .reduce<string[]>((summary, entry) => {
      return summary.concat(`${entry[0]}: ${entry[1]}x`)
    }, [])
    .join(', ') || 'No errors'

  const warningSummary = Object.entries(util.countBy(importer.warnings, x => x.message))
    .reduce<string[]>((summary, entry) => {
      return summary.concat(`${entry[0]}: ${entry[1]}x`)
    }, [])
    .join(', ') || 'No warnings'

  const state = {
    importId: importer.importId,
    isImportInProcess: !finished,
    importInProgress: !finished,
    progress,
    startTime: importer.startTime,
    endTime: importer.endTime,
    startAt: importer.startAt,
    endAt: importer.endAt,
    errorSummary,
    warningSummary,
    /** Legacy id attribute for FE to display logs */
    id: importer.importId,
  }
  await Promise.allSettled([
    firestore.save(
      importer.firestore,
      'imports/info',
      state
    ),
    !importer.trackOnlyDataInFirestore && importer.importId && firestore.save(
      importer.firestore,
      firestore.path['/imports/{id}']({ id: importer.importId }),
      firestore.convertFirstoreKeys(state, { dates: ['endAt', 'endTime', 'startAt', 'startTime'] })
    ),
  ])
  return state
}

export function updateProgress(stage: 'savingToDatabase', opts?: { step: number, maxSteps: number}): number
export function updateProgress(stage: 'start' | 'ready' | 'collectingData' | 'finished'): number
export function updateProgress(
  stage: 'start' | 'ready' | 'collectingData' | 'savingToDatabase' | 'finished',
  opts?: { step: number, maxSteps: number }
): number {
  const progress: Record<typeof stage, number> = {
    start: 0,
    ready: 0.01,
    collectingData: 0.05,
    savingToDatabase: 0.3,
    finished: 1,
  }
  let progressValue = progress[stage]
  if (stage === 'savingToDatabase' && opts) {
    progressValue = progress.savingToDatabase + (progress.finished - progress.savingToDatabase) * (opts.step / opts.maxSteps)
  }
  return Number(progressValue.toFixed(2))
}

export const addItem = async (importer: EventImporter, item: Item) => {
  importer.progress = updateProgress('collectingData')
  // entity itself `type:id:lang`
  {
    const key = `${item.type}:${item.id}:${item.language}`
    await importer.store.set(key, item)
  }
  // type ids list `type-ids`
  {
    const key = `${item.type}-ids`
    await addUniq(key, item.id)
  }
  // performer sessions
  if (item.type === 'session' && item.data?.performerIds) {
    await Promise.all(
      item.data.performerIds
        ?.map(async performerId => {
          const key = `performer2sessions:${performerId}`
          await addUniq(key, item.id)
        })
    )
  }
  // performer venues
  if (item.type === 'session' && item.data?.venueId && item.data?.performerIds) {
    await Promise.all(
      item.data.performerIds
        ?.map(async performerId => {
          const key = `performer2venues:${performerId}`
          await addUniq(key, item.data.venueId)
        })
    )
  }
  // sessions' parent session
  if (item.type === 'session' && item.data.subsessionIds?.length) {
    await Promise.all(
      item.data.subsessionIds.map(async subsessionId => {
        const key = `session2parent:${subsessionId}`
        await addUniq(key, item.data.id)
      })
    )
  }
  // group items
  if (item.type === 'group') {
    await Promise.all([
      ...(item.data.performerIds ?? []).map(async id => {
        const key = `group2performers:${id}`
        await addUniq(key, item.data.id)
      }),
      ...(item.data.sessionIds ?? []).map(async id => {
        const key = `group2sessions:${id}`
        await addUniq(key, item.data.id)
      }),
    ])
  }
  if (item.type === 'performer' && item.data.groupId) {
    const key = `group2performers:${item.data.groupId}`
    await addUniq(key, item.id)
  }
  if (item.type === 'session' && item.data.groupId) {
    const key = `group2sessions:${item.data.groupId}`
    await addUniq(key, item.id)
  }
  async function addUniq(key: string, value?: Item['id']) {
    if (value === undefined) return importer.store.get(key)
    const currentValue = (importer.store as any).store.get(key)
    const ids: Array<Item['id']> = currentValue || []
    const newIds = util.uniq(ids.concat(value))
    await importer.store.set(key, newIds)
    return newIds
  }
}

export const addItems = async (importer: EventImporter, items: Item[]) => {
  await items.reduce(async (last, x) => {
    await last
    await Promise.resolve(setImmediate)
    await addItem(importer, x)
  }, Promise.resolve())
}

export const constructItems = async <TType extends Item['type'], TConstructed>(importer: EventImporter, type: TType, construct: (item: Item & { type: TType }, meta: { index: number, languageCode: string, id: Item['id'] }) => TConstructed) => {
  const ids: Array<Item['id']> = (await importer.store.get(`${type}-ids`)) || []
  const constructed = await util.settle(
    ids.flatMap((id, i) => {
      return importer.settings.languages
        .flatMap(async languageCode => {
          const item = await populateId(importer, type, id, languageCode)
          if (!item) throw errors.createImportError(importer, errors.NO_ITEM_DATA)
          return construct(item, {
            id,
            languageCode,
            index: i,
          })
        })
    })
  )
  reportErrors(importer, constructed.errors, { marksItemInvalid: true })
  // TODO Better idea to let TConstructed be a (Promise<A> | A) but result in A here?
  return constructed as Omit<typeof constructed, 'results'> & { results: Array<util.Unpromise<TConstructed>> }
}

export const validateItems = async <TItem extends Item>(importer: EventImporter, constructed: TItem[]) => {
  const validated = await util.settle(
    constructed.map(item =>
      validation.validate(importer, item)
    )
  )
  reportErrors(importer, validated.errors, { marksItemInvalid: true })
  return validated
}

/**
 * Adds error to importer.
 *
 * If opts.marksItemInvalid=true, related item won't be imported.
 */
 export const reportErrors = (importer: EventImporter, items: errors.ImportError[], opts?: { marksItemInvalid?: true}) => {
    items.forEach(item => {
      importer.errors.push(item)
      if (opts?.marksItemInvalid && item.item) {
        importer.invalidEntity[item.item.type][item.item.id] = item.item
      }
    })
  }

export const probe = (() => {
  const addFirestoreLog = async (
    importer: EventImporter,
    message: string,
    severity: 'INFO' | 'ERROR'
  ) => {
    await (!importer.trackOnlyDataInFirestore &&
      importer.importId &&
      firestore.add(
        importer.firestore,
        firestore.path['/imports/{id}/logs']({ id: importer.importId }),
        firestore.convertFirstoreKeys(
          {
            timestamp: new Date(),
            severity,
            message: message,
          },
          { dates: ['timestamp'] }
        )
      ))
  }
  return util.createDomainProbe({
    loadingDataFailed: (error: Error) => error,
    importStarted: (importer: EventImporter) => {
      void addFirestoreLog(importer, 'Import started', 'INFO')
    },
    savingItemsOfType: ({
      importer,
      type,
    }: {
      importer: EventImporter
      type: Item['type']
    }) => {
      void importer.store.get(`${type}-ids`).then(async (ids: string[]) => {
        await addFirestoreLog(
          importer,
          `Saving ${ids?.length}x ${type}`,
          'INFO'
        )
      })
    },
    savedItemsOfType: ({
      importer,
      type,
    }: {
      importer: EventImporter
      type: Item['type']
    }) => {
      const invalidCount = Object.keys(importer.invalidEntity[type]).length
      if (invalidCount) {
        void addFirestoreLog(
          importer,
          `${invalidCount}x invalid ${type}`,
          'ERROR'
        )
      }
    },
    deletingUnreferencedDocuments: (importer: EventImporter) => {
      void addFirestoreLog(importer, 'Deleting unreferenced documents', 'INFO')
    },
    importFinished: (importer: EventImporter) => {
      void addFirestoreLog(importer, 'Import finished', 'INFO')
    },
  })
})()

/**
 * Return array of custom fields from given input suitable for import.
 *
 * Ignores empty/incomplete custom fields by default.
 */
export const sanitizeCustomFields = (
  items?: Array<{ name?: any; value?: any }>
): entity.CustomField[] => {
  if (!items) return []
  return items
    .map(x => ({
      name: x.name ? String(x.name) : '',
      value: x.value ? String(x.value) : '',
    }))
    .filter(x => x.name && x.value)
}

/**
 * Return array of links from given input suitable for import.
 *
 * Ignores empty/incomplete links by default.
 */
export const sanitizeLinks = (
  items?: Array<{ type?: any; uri?: any }>
): entity.Link[] => {
  if (!items) return []
  return items
    .map(x => ({
      type: x.type ? String(x.type) : ('' as any),
      uri: x.uri ? String(x.uri) : '',
    }))
    .filter(x => x.type && x.uri)
}

/**
 * Get complete data for language for given id/ids. (default language where
 * language data is not available)
 *
 * Report warning if given ID was earlier marked as invalid.
 */
export function populateId<TItemType extends Item['type']>(
  importer: EventImporter,
  ent: TItemType,
  id: Array<Item['id']> | undefined,
  lang: Item['language']
): Promise<Array<Item & { type: TItemType }>>
export function populateId<TItemType extends Item['type']>(
  importer: EventImporter,
  ent: TItemType,
  id: Item['id'] | undefined,
  lang: Item['language']
): Promise<(Item & { type: TItemType }) | undefined>
export async function populateId<TItemType extends Item['type']>(
  importer: EventImporter,
  ent: TItemType,
  id: Item['id'] | Array<Item['id']> | undefined,
  lang: Item['language']
): Promise<
  (Item & { type: TItemType }) | Array<Item & { type: TItemType }> | undefined
> {
  if (!id) return
  const ids = Array.isArray(id) ? id : [id]
  const result = await util.settle(
    ids.map(async id => {
      if (importer.invalidEntity[ent][id]) {
        importer.warnings.push(
          errors.createImportError(importer, errors.INVALID_ITEM_REFERENCE)
        )
        return
      }
      const languageData = await importer.store.get(`${ent}:${id}:${lang}`)
      const defualtLanguageData = await await importer.store.get(
        `${ent}:${id}:${importer.settings.defaultLanguage}`
      )
      return util.defaults(defualtLanguageData, languageData) as Item & {
        type: typeof ent
      }
    })
  )
  return Array.isArray(id)
    ? result.results.filter(x => x).map(x => x!)
    : result.results[0]
}

export const createMemoryStore = () => {
  const store = new Map()
  return {
    store,
    async set(key: string, value: any) {
      await new Promise(setImmediate)
      store.set(key, value)
    },
    async get(key: string) {
      await new Promise(setImmediate)
      return store.get(key)
    },
  }
}
