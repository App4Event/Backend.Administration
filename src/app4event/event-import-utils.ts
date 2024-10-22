import * as entity from './entity'
import { Day, EventImporter, Group, Item, Language, Performer, Session, upload, Venue } from './event-import'
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
  // sessions' subsessions
  if (item.type === 'session' && item.data.parentId) {
    const key = `session2parent:${item.id}`
    await addUniq(key, item.data.id)
  }
  // group items
  if (item.type === 'group') {
    for (const id of item.data.performerIds ?? []) {
      const key = `group2performers:${item.id}`
        await addUniq(key, id)
    }
    for (const id of item.data.sessionIds ?? []) {
      const key = `group2sessions:${item.id}`
        await addUniq(key, id)
    }
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

const typeToGetImages = {
  performer: (x: Performer) => x.data?.images,
  session: (x: Session) => x.data?.images,
  group: (x: Group) => x.data?.images,
  language: (_: Language) => [] as entity.Image[],
  venue: (x: Venue) => x.data.images,
  day: (_: Day) => [] as entity.Image[],
}

const typeToSetImages = {
  performer: (x: Performer, images: entity.Image[]) => { x.data.images = images },
  session: (x: Session, images: entity.Image[]) => { x.data.images = images },
  group: (x: Group, images: entity.Image[]) => { x.data.images = images },
  language: (_: Language) => [] as entity.Image[],
  venue: (x: Venue, images: entity.Image[]) => { x.data.images = images },
  day: (_: Day) => [] as entity.Image[],
}

const reuploadImage = async <T extends Item>(importer: EventImporter, item: T, image: entity.Image) => {
  // TODO Call importer.setings.upload for image
  // catch for error map
  try {
    return await importer.settings.reuploadImage!(image)
  } catch (error) {
    throw errors.createImportError(importer, 'image-reupload-failed', { error, item })
  }
}

const reuploadImages = async <TItem extends Item>(importer: EventImporter, item: TItem) => {
  if (!importer.settings.reuploadImage) return
  const getImages = typeToGetImages[item.type]
  // TODO Why 'never'??
  const images = getImages(item as any) ?? []
  if (!images.length) return
  const result = await util.settle(images.filter(x => x).map(async x => {
    const reuploaded = await reuploadImage(importer, item, x)
    return {
      reuploaded,
      original: x,
    }
  }))
  reportErrors(importer, result.errors)
  const reuploaded = result.results.map(x => x.reuploaded).filter(x => x).map(x => x!)
  typeToSetImages[item.type](item as any, reuploaded)
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
  // TConstructed here should be TItem
  const constructedItems = constructed as Omit<typeof constructed, 'results'> & { results: Array<util.Unpromise<TConstructed>> }

  await util.chunk((constructedItems.results.flatMap(x => x) as Item[]), 20)
    .reduce(async (last, items) => {
      await last
      await Promise.all(items.map(item => reuploadImages(importer, item)))
    }, Promise.resolve())
  return constructedItems
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

export const ensureError = (error: unknown) => {
  if (error instanceof Error) {
    return error
  }
  return new Error(String(error))
}

export const probe = (() => {
  const p = util.createDomainProbe({
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
          `Saving ${ids?.length ?? 0}x ${type}`,
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
      const examples = getErrorExamples(importer, { entityType: type, samples: importer.errorReportExamples })
      if (examples.invalidCount) {
        void addFirestoreLog(
          importer,
          `${examples.invalidCount}x invalid ${type}, for example: ${examples.invalidMessage}`,
          'ERROR'
        )
      }
      if (examples.sessionOutOfBoundsCount) {
        void addFirestoreLog(importer, `${examples.sessionOutOfBoundsCount} sessions will not be visible in the app, for example ${examples.sessionOutOfBoundsMessage}`, 'ERROR')
      }
    },
    addedItemsUpdated: (param: {
      importer: EventImporter
      itemTypeToAddedCount: Record<Item['type'], number>
    }) => {
      const serializedCounts = Object.entries(param.itemTypeToAddedCount)
        .filter(x => x[1] > 0)
        .map(x => `${x[0]} ${x[1]}x`)
        .join(', ')
      void addFirestoreLog(param.importer, `Loading from remote (${serializedCounts})`, 'INFO')
    },
    deletingUnreferencedDocuments: (importer: EventImporter) => {
      void addFirestoreLog(importer, 'Deleting unreferenced documents', 'INFO')
    },
    importFinished: (importer: EventImporter) => {
      void addFirestoreLog(importer, 'Import finished', 'INFO')
    },
    log: (event: { message: string, severity: 'INFO' | 'ERROR' | 'WARNING' }) => event,
  })
  return p
  async function addFirestoreLog(
    importer: EventImporter,
    message: string,
    severity: 'INFO' | 'ERROR' | 'WARNING'
  ) {
    p.log({ message, severity })
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
})()

function getErrorExamples(importer: EventImporter, param: { samples: number, entityType: Item['type'] }) {
  const invalidCount = Object.keys(importer.invalidEntity[param.entityType]).length
  let invalidMessage = ''
  if (invalidCount) {
    const criticalErrors = importer.errors.filter((x): x is errors.ImportError => {
      return (
        (x.message === errors.INVALID_ITEM_DATA ||
          x.message === errors.NO_VALIDATION_SCHEMA) &&
        (x as errors.ImportError).item?.type === param.entityType
      )
    })
      .slice(0, param.samples)
      .map(x => serializeError(x))
    invalidMessage = criticalErrors.join(', ')
  }

  let sessionOutOfBoundsCount = 0
  let sessionOutOfBoundsMessage = ''
  if (param.entityType === 'session') {
    const outOfBounds = importer.warnings.filter(x => x.message === errors.SESSION_OUT_OUF_BOUNDS).slice(0, param.samples) as errors.ImportError[]
    sessionOutOfBoundsCount = outOfBounds.length

    if (outOfBounds.length) {
      sessionOutOfBoundsMessage = outOfBounds.map(x => serializeSessionOutOfBoundsError(x)).join(', ')
    }
  }
  return {
    invalidCount,
    invalidMessage,
    sessionOutOfBoundsCount,
    sessionOutOfBoundsMessage,
  }
  function serializeSessionOutOfBoundsError(importError: errors.ImportError) {
    const example = importError.item as Session | undefined
    const name = example?.data.name ? `name=${example.data.name}` : ''
    const id = example?.data.id ? `id=${example.data.id}` : ''
    const err = importError.error as errors.SessionOutOfBoundsError
    return [
      id,
      name,
      `takes place ${err.sessionBounds[0].toLocaleString()}-${err.sessionBounds[1].toLocaleString()}`,
      err.dayBounds
        ? `but day starts on ${err.dayBounds[0].toLocaleString()} and ends ${err.dayBounds[1].toLocaleString()}`
        : 'but there is no such day in event',
    ].filter(x => x).join(' ')
  }
  function serializeError(err: errors.ImportError) {
    const exampleItem = err?.item
    const exampleName = String((exampleItem?.data as any)?.name ?? '')
    const reason = err?.error?.[0]?.message ?? err?.error?.message
    return [
      `id=${exampleItem?.id ?? ''}`,
      exampleName ? `name=${exampleName}` : '',
      reason,
    ].filter(x => x).join(' ')
  }
}

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
      uri: x.uri ? String(x.uri).trim() : '',
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

export const startDataLoadProgress = (importer: EventImporter) => {
  let lastCounts = initCounts()
  const readCurrentStatus = async () => {
    const typeCounts = await Promise.all(
      (Object.keys(lastCounts) as Array<keyof typeof lastCounts>).map(type =>
        ((importer.store.get(`${type}-ids`) as any) as Promise<
          string[] | undefined
        >).then(x => {
          return {
            type,
            count: (x ?? []).length,
          }
        })
      )
    )
    const counts = initCounts()
    typeCounts.forEach(x => (counts[x.type] = x.count))
    if (JSON.stringify(counts) !== JSON.stringify(lastCounts)) {
      probe.addedItemsUpdated({ importer, itemTypeToAddedCount: counts })
    }
    lastCounts = counts
  }
  const t = setInterval(
    () => {
      if (importer.progress >= 0.3) { // Saving to database
        clearInterval(t)
        return
      }
      void readCurrentStatus()
    },
    1000
  )
  return function destroy() {
    clearInterval(t)
  }

  function initCounts(): Record<Item['type'], number> {
    return {
      day: 0,
      group: 0,
      language: 0,
      performer: 0,
      session: 0,
      venue: 0,
    }
  }
}

export const reportSessionsOutOfBounds = async (importer: EventImporter, sessions: Session[]) => {
  const days = (await populateId(importer, 'day', await importer.store.get('day-ids'), importer.settings.defaultLanguage)) ?? []
  if (!days.length) return
  const dayRanges = days.map(x => [util.createDate(x.data.timeFrom)!, util.createDate(x.data.timeTo)!] as const)
    .filter(x => x[0] && x[1])
  const datestamp = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  sessions.forEach(session => {
    const from = util.createDate(session.data.timeFrom)
    const to = util.createDate(session.data.timeTo)
    if (!from || !to) return

    const hasDay = dayRanges.find(x => (from >= x[0] && from <= x[1]) || (to >= x[0] && to <= x[1]))
    if (hasDay) return

    const startDayStamp = datestamp(from)
    const endDayStamp = datestamp(to)

    const startDay = dayRanges.find(x => datestamp(x[0]) === startDayStamp || datestamp(x[1]) === startDayStamp)
    const endDay = dayRanges.find(x => datestamp(x[0]) === endDayStamp || datestamp(x[1]) === endDayStamp)
    if (startDay) {
      importer.warnings.push(errors.createImportError(importer, errors.SESSION_OUT_OUF_BOUNDS, {
        error: errors.createSessionOutOfBoundsError(session, 'session-out-of-day', startDay, [from, to]),
        item: session,
      }))
    } else if (endDay) {
      importer.warnings.push(errors.createImportError(importer, errors.SESSION_OUT_OUF_BOUNDS, {
        error: errors.createSessionOutOfBoundsError(session, 'session-out-of-day', endDay, [from, to]),
        item: session,
      }))
    } else {
      importer.warnings.push(errors.createImportError(importer, errors.SESSION_OUT_OUF_BOUNDS, {
        error: errors.createSessionOutOfBoundsError(session, 'session-out-of-day', undefined, [from, to]),
        item: session,
      }))
    }
  })
}
