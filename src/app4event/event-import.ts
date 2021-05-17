import * as entity from './entity'
import * as util from './util'
import * as firestore from './firestore'
import * as ISO6391 from 'iso-639-1'
import * as uuid from 'uuid'
import * as validation from './validation'
import * as errors from './errors'

export const createImporter = async (settings: Settings) => {
  /* eslint-disable @typescript-eslint/consistent-type-assertions */

  const f = firestore.connectFirestore()
  const i = {
    importId: '',
    settings,
    store: settings.store ?? createMemoryStore(),
    startTime: new Date(),
    endTime: undefined as Date | undefined,
    progress: updateProgress('start'),
    firestore: f,
    trackOnlyDataInFirestore: settings.trackOnlyDataInFirestore ?? false,
    /** Legacy for startTime/endTime */
    startAt: new Date(),
    endAt: undefined as Date | undefined,
    errors: [] as Error[],
    warnings: [] as Error[],
    invalidEntity: {
      session: {} as Record<string, Item & { type: 'session' }>,
      performer: {} as Record<string, Item & { type: 'performer' }>,
      venue: {} as Record<string, Item & { type: 'venue' }>,
    },
  }
  await saveImporterState(i)
  i.progress = updateProgress('ready')
  await saveImporterState(i)
  return i
}

export const deleteUnreferenced = async (importer: EventImporter) => {
  await pruneLanguagesCollection('performer')
  await pruneLanguagesCollection('session')
  await pruneLanguagesCollection('venue')

  async function getKeepIds(ent: Item['type']) {
    const downloadedIds: string[] = await importer.store.get(`${ent}-ids`) ?? []
    const invalidIds = Object.keys(importer.invalidEntity[ent])
    return util.difference(downloadedIds, invalidIds)
  }
  function getEntityCollection(ent: Item['type']) {
    const choices: Record<Item['type'], any> = {
      performer: firestore.path['/languages/{lang}/performers'],
      session: firestore.path['/languages/{lang}/sessions'],
      venue: firestore.path['/languages/{lang}/venues'],
    }
    return choices[ent]
  }
  /**
   * @param path Those only with { lang } input
   */
  async function pruneLanguagesCollection(ent: Item['type']) {
    await Promise.all(
      importer.settings.languages.map(async language => {
        const collectionName = getEntityCollection(ent)({ lang: language } as any)
        const keepIds = await getKeepIds(ent)
        const collectionIds = await firestore.getCollectionDocumentIds(
          importer.firestore,
          collectionName
        )
        const deleteIds = util.difference(collectionIds.ids, keepIds)
        deleteIds.forEach(_id => {
          importer.warnings.push(errors.createImportError(importer, errors.DELETED_DATABASE_ITEM))
        })
        await firestore.deleteCollectionDocumentsByIds(
          importer.firestore,
          collectionName,
          deleteIds
        )
      })
    )
  }
}

export const createImport = async (importer: EventImporter) => {
  const i = {
    ...importer,
    importId: uuid.v4(),
  }
  await saveImporterState(i)
  return i
}

const saveImporterState = async (importer: EventImporter) => {
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
    isImportInProcess: !finished,
    importInProgress: !finished,
    progress,
    startTime: importer.startTime,
    endTime: importer.endTime,
    startAt: importer.startAt,
    endAt: importer.endAt,
    errorSummary,
    warningSummary,
  }
  await Promise.allSettled([
    firestore.save(
      importer.firestore,
      'imports/info',
      state
    ),
    !importer.settings.trackOnlyDataInFirestore && importer.importId && firestore.save(
      importer.firestore,
      firestore.path['/imports/{id}']({ id: importer.importId }),
      firestore.convertFirstoreKeys(state, { dates: ['endAt', 'endTime', 'startAt', 'startTime'] })
    ),
  ])
}

function updateProgress(stage: 'savingToDatabase', opts?: { step: number, maxSteps: number}): number
function updateProgress(stage: 'start' | 'ready' | 'collectingData' | 'finished'): number
function updateProgress(
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
  if (item.type === 'session' && item.data.subsessionIds?.length) {
    await Promise.all(
      item.data.subsessionIds.map(async subsessionId => {
        const key = `session2parent:${subsessionId}`
        await addUniq(key, item.data.id)
      })
    )
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

const saveLanguages = async (importer: EventImporter) => {
  const records: entity.Language[] = importer.settings.languages
    .map(languageCode => ({
      isDefault: languageCode === importer.settings.defaultLanguage,
      name: ((ISO6391 as any) as typeof ISO6391.default).getNativeName(languageCode) || languageCode,
      id: languageCode,
    }))
  await Promise.allSettled(
    records.map(data => firestore.save(
        importer.firestore,
        firestore.path['/languages/{lang}/']({ lang: data.id }),
        data
      ))
  )
}

const saveVenues = async (importer: EventImporter) => {
  const ids: Array<Item['id']> = (await importer.store.get('venue-ids')) || []
  const constructed = await util.settle(
    ids.flatMap(id => {
      return importer.settings.languages
        .flatMap(async languageCode => {
          const item = await populateId(importer, 'venue', id, languageCode)
          if (!item) throw errors.createImportError(importer, errors.NO_ITEM_DATA)
          return {
            ...item,
            language: languageCode,
            data: {
              ...item?.data,
              id,
            },
          }
        })
    })
  )
  reportErrors(importer, constructed.errors, { marksItemInvalid: true })
  const validated = await util.settle(
    constructed.results.map(item =>
      validation.validate(importer, item)
    )
  )
  reportErrors(importer, validated.errors, { marksItemInvalid: true })

  await util.settle(
    validated.results.map(item =>
      firestore.save(
        importer.firestore,
        firestore.path['/languages/{lang}/venues/{id}']({ lang: item.language, id: item.id }),
        item.data
      )
    )
  )
}

const savePerformers = async (importer: EventImporter) => {
  const ids: Array<Item['id']> = (await importer.store.get('performer-ids')) || []
  const constructed = await util.settle(
    ids.flatMap(id => {
      return importer.settings.languages
        .flatMap(async languageCode => {
          const item = await populateId(importer, 'performer', id, languageCode)
          if (!item) throw errors.createImportError(importer, errors.NO_ITEM_DATA)
          const referencedSessionIds: Array<Session['data']['id']> = (await importer.store.get(`performer2sessions:${id}`)) ?? []
          const referencedVenueIds: Array<NonNullable<Session['data']['venueId']>> = (await importer.store.get(`performer2venues:${id}`)) ?? []
          const sessions = await populateId(importer, 'session', referencedSessionIds, languageCode)
          const sessionIds = util.pluck(sessions, x => x?.data.id)
          const venues = await populateId(importer, 'venue', referencedVenueIds, languageCode)
          const venueIds = util.pluck(venues, x => x.id)
          const customFields = sanitizeCustomFields(item.data.customFields)
          return {
            ...item,
            language: languageCode,
            data: {
              ...item.data,
              id,
              sessionIds,
              venueIds,
              customFields,
            },
          }
        })
    })
  )
  reportErrors(importer, constructed.errors, { marksItemInvalid: true })
  const validated = await util.settle(
    constructed.results.map(item =>
      validation.validate(importer, item)
    )
  )
  reportErrors(importer, validated.errors, { marksItemInvalid: true })
  await util.settle(
    validated.results.map(item =>
      firestore.save(
        importer.firestore,
        firestore.path['/languages/{lang}/performers/{id}']({ lang: item.language, id: item.id }),
        item.data
      )
    )
  )
}

const saveSessions = async (importer: EventImporter) => {
  const ids: Array<Item['id']> = (await importer.store.get('session-ids')) || []
  const constructed = await util.settle(
    ids.flatMap(id => {
      return importer.settings.languages
        .flatMap(async languageCode => {
          const data = await populateId(importer, 'session', id, languageCode)
          if (!data) throw errors.createImportError(importer, errors.NO_ITEM_DATA)
          const performers = await populateId(importer, 'performer', data?.data.performerIds, languageCode)
          const venue = await populateId(importer, 'venue', data?.data.venueId, languageCode)
          const subsessionIds = (await populateId(importer, 'session', data?.data.subsessionIds, languageCode))
            ?.map(x => x.id) ?? []
          const parentIds: Array<Item['id']> = await importer.store.get(`session2parent:${id}`) ?? []
          const parents = await populateId(importer, 'session', parentIds, languageCode)
          const performerNames = util.pluck(performers, x => x.data.name)
          const performerIds = util.pluck(performers, x => x.data.id)
          const venueName = venue?.data.name
          const venueId = venue?.id
          const parent = parents[0]
          return {
            ...data,
            language: languageCode,
            data: {
              ...data?.data,
              id,
              hasParent: !!parent,
              subsessionIds,
              performerIds,
              performerNames,
              venueId,
              venueName,
            },
          }
        })
    })
  )
  reportErrors(importer, constructed.errors, { marksItemInvalid: true })
  const validated = await util.settle(
    constructed.results.map(item =>
      validation.validate(importer, item)
    )
  )
  reportErrors(importer, validated.errors, { marksItemInvalid: true })
  await util.settle(
    validated.results.map(item =>
      firestore.save(
        importer.firestore,
        firestore.path['/languages/{lang}/sessions/{id}']({ lang: item.language, id: item.id }),
        firestore.convertFirstoreKeys(item.data, { dates: ['timeFrom', 'timeTo'] })
      )
    )
  )
}

const uploadLoading = (importer: EventImporter, tasks: Array<() => Promise<any>>) => {
  return tasks.reduce(async (last, task, i) => {
    await last
    importer.progress = updateProgress('savingToDatabase', { step: i + 1, maxSteps: tasks.length })
    await saveImporterState(importer)
    await task()
  }, Promise.resolve())
}

export const upload = async (importer: EventImporter) => {
  importer.progress = updateProgress('savingToDatabase')
  await uploadLoading(importer, [
    () => saveLanguages(importer),
    () => saveVenues(importer),
    () => savePerformers(importer),
    () => saveSessions(importer),
    () => deleteUnreferenced(importer),
  ])
  importer.progress = updateProgress('finished')
  importer.endAt = new Date()
  importer.endTime = new Date()
  await saveImporterState(importer)
}
export const reportErrors = (importer: EventImporter, items: errors.ImportError[], opts?: { marksItemInvalid?: true}) => {
  items.forEach(item => {
    importer.errors.push(item)
    if (opts?.marksItemInvalid && item.item) {
      importer.invalidEntity[item.item.type][item.item.id] = item.item
    }
  })
}

/**
 * Start the import with given start function
 * in order to wrap initial call with importer for possible errors
 *
 * StartFn is any user defined function working with given importer.
 *
 * @param importer
 * @param startFn
 */
export const startLoading = async (importer: EventImporter, load: (importer: EventImporter) => Promise<void>) => {
  try {
    await load(importer)
  } catch (error) {
    importer.errors.push(errors.createImportError(importer, errors.LOADING_DATA_FAILED))
    await saveImporterState(importer)
  }
}

function populateId<TItemType extends Item['type']>(importer: EventImporter, ent: TItemType, id: Array<Item['id']> | undefined, lang: Item['language']): Promise<Array<Item & { type: TItemType }>>
function populateId<TItemType extends Item['type']>(importer: EventImporter, ent: TItemType, id: Item['id'] | undefined, lang: Item['language']): Promise<Item & { type: TItemType } | undefined>
async function populateId<TItemType extends Item['type']>(importer: EventImporter, ent: TItemType, id: Item['id'] | Array<Item['id']> | undefined, lang: Item['language']): Promise<Item & { type: TItemType } | Array<Item & { type: TItemType }> | undefined> {
  if (!id) return
  const ids = Array.isArray(id) ? id : [id]
  const result = await util.settle(
    ids.map(async id => {
      if (importer.invalidEntity[ent][id]) {
        // TODO Raise warning of referencing invalid entity
        importer.warnings.push(errors.createImportError(importer, errors.INVALID_ITEM_REFERENCE))
        return
      }
      const languageData = await importer.store.get(`${ent}:${id}:${lang}`)
      const defualtLanguageData = await await importer.store.get(`${ent}:${id}:${importer.settings.defaultLanguage}`)
      return util.defaults(
        languageData,
        defualtLanguageData
      ) as Item & { type: typeof ent }
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

export interface Performer {
  type: 'performer'
  data: Partial<entity.Performer> & Pick<entity.Performer, 'id'>
}
export interface Session {
  type: 'session'
  data: Partial<entity.Session> & Pick<entity.Session, 'id'>
}
export interface Venue {
  type: 'venue'
  data: Partial<entity.Venue> & Pick<entity.Venue, 'id'>
}
export type Item = { id: string; type: string; language: string; } & (Performer | Session | Venue)
export interface Settings {
  /** cs, en, ... */
  languages: string[]
  /** cs, en, ... */
  defaultLanguage: string
  /** If true, no event progrss is written/updated in firestore, only imported data */
  trackOnlyDataInFirestore?: boolean
  /** memory story by default, @see {@link createMemoryStore} */
  store?: {
    set: (key: string, val: any) => void
    get: (key: string) => Promise<any>
  }
}
export type EventImporter = util.Unpromise<ReturnType<typeof createImporter>>

export const sanitizeCustomFields = (items?: Array<{ name?: any, value?: any }>): entity.CustomField[] => {
  if (!items) return []
  return items
    .map(x => ({
      name: x.name ? String(x.name) : '',
      value: x.value ? String(x.value) : '',
    }))
    .filter(x => x.name && x.value)
}
