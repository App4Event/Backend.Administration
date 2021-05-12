import * as entity from './entity'
import * as util from './util'
import * as firestore from './firestore'
import * as ISO6391 from 'iso-639-1'
import * as uuid from 'uuid'
import * as validation from './validation'
import * as errors from './errors'

export const createImporter = async (settings: Settings) => {
  const f = firestore.connectFirestore()
  const i = {
    importId: '',
    settings,
    store: settings.store ?? createMemoryStore(),
    startTime: new Date(),
    endTime: undefined as Date | undefined,
    progressTitle: updateProgress('start'),
    firestore: f,
    trackOnlyDataInFirestore: settings.trackOnlyDataInFirestore ?? false,
    /** Legacy for startTime/endTime */
    startAt: new Date(),
    endAt: undefined as Date | undefined,
  }
  await saveImporterState(i)
  return i
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
  const finished = importer.progressTitle !== '100%'
  const state = {
    isImportInProcess: finished,
    importInProgress: finished,
    progress: importer.progressTitle,
    startTime: importer.startTime,
    endTime: importer.endTime,
    startAt: importer.startAt,
    endAt: importer.endAt,
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
      state
    ),
  ])
}

const updateProgress = (
  stage: 'start' | 'collectingData' | 'savingToDatabase' | 'finished'
) => {
  const progress: Record<typeof stage, string> = {
    start: '0%',
    collectingData: '1%',
    savingToDatabase: '30%',
    finished: '100%',
  }
  return progress[stage]
}

export const addItem = async (importer: EventImporter, item: Item) => {
  importer.progressTitle = updateProgress('collectingData')
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
  const validated = await util.settle(
    constructed.results.map(item =>
      validation.validate(importer, item)
    )
  )
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
          return {
            ...item,
            language: languageCode,
            data: {
              ...item.data,
              id,
              sessionIds,
              venueIds,
            },
          }
        })
    })
  )
  const validated = await util.settle(
    constructed.results.map(item =>
      validation.validate(importer, item)
    )
  )
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
          const subsessionIds: string[] = [] // TODO
          const performerNames = util.pluck(performers, x => x.data.name)
          const performerIds = util.pluck(performers, x => x.data.id)
          const venueName = venue?.data.name
          const venueId = venue?.id
          return {
            ...data,
            language: languageCode,
            data: {
              ...data?.data,
              id,
              hasParent: false, // TODO
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
  const validated = await util.settle(
    constructed.results.map(item =>
      validation.validate(importer, item)
    )
  )
  await util.settle(
    validated.results.map(item =>
      firestore.save(
        importer.firestore,
        firestore.path['/languages/{lang}/sessions/{id}']({ lang: item.language, id: item.id }),
        item.data
      )
    )
  )
}

export const upload = async (importer: EventImporter) => {
  importer.progressTitle = updateProgress('savingToDatabase')
  await saveLanguages(importer)
  await saveSessions(importer)
  await saveVenues(importer)
  await savePerformers(importer)
  importer.progressTitle = updateProgress('finished')
  importer.endAt = new Date()
  importer.endTime = new Date()
  await saveImporterState(importer)
}

function populateId<TItemType extends Item['type']>(importer: EventImporter, ent: TItemType, id: Array<Item['id']> | undefined, lang: Item['language']): Promise<Array<Item & { type: TItemType }>>
function populateId<TItemType extends Item['type']>(importer: EventImporter, ent: TItemType, id: Item['id'] | undefined, lang: Item['language']): Promise<Item & { type: TItemType } | undefined>
async function populateId<TItemType extends Item['type']>(importer: EventImporter, ent: TItemType, id: Item['id'] | Array<Item['id']> | undefined, lang: Item['language']): Promise<Item & { type: TItemType } | Array<Item & { type: TItemType }> | undefined> {
  if (!id) return
  const ids = Array.isArray(id) ? id : [id]
  const result = await util.settle(
    ids.map(async id => {
      const languageData = await importer.store.get(`${ent}:${id}:${lang}`)
      const defualtLanguageData = await await importer.store.get(`${ent}:${id}:${importer.settings.defaultLanguage}`)
      return util.defaults(
        languageData,
        defualtLanguageData
      ) as Item & { type: typeof ent }
    })
  )
  return Array.isArray(id) ? result.results.filter(x => x) : result.results[0]
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
