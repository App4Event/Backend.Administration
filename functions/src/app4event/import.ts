import * as entity from './entity'
import * as util from './util'
import * as firestore from './firestore'
import * as ISO6391 from 'iso-639-1'
import * as uuid from 'uuid'
import * as validation from './validation'

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
    /** Legacy for startTime/endTime */
    startAt: new Date(),
    endAt: undefined as Date | undefined,
  }
  await saveImporterState(i)
  return i
}

export const createImport = async (importer: Importer) => {
  const i = {
    ...importer,
    importId: uuid.v4(),
  }
  await saveImporterState(i)
  return i
}

const saveImporterState = async (importer: Importer) => {
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
    importer.importId && firestore.save(
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

export const addItem = async (importer: Importer, item: Item) => {
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
          await addUniq(key, item.data.venueId!)
        })
    )
  }
  async function addUniq(key: string, value: Item['id']) {
    const currentValue = (importer.store as any).store.get(key)
    const ids: Array<Item['id']> = currentValue || []
    const newIds = util.uniq(ids.concat(value))
    await importer.store.set(key, newIds)
    return newIds
  }
}

export const addItems = async (importer: Importer, items: Item[]) => {
  await items.reduce(async (last, x) => {
    await last
    await Promise.resolve(setImmediate)
    await addItem(importer, x)
  }, Promise.resolve())
}

const saveLanguages = async (importer: Importer) => {
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

const saveVenues = async (importer: Importer) => {
  const ids: Array<Item['id']> = (await importer.store.get('venue-ids')) || []
  const constructed = await util.settle(
    ids.flatMap(id => {
      const defaultDataP: Promise<Item & { type: 'venue' }> = importer.store.get(`venue:${id}:${importer.settings.defaultLanguage}`)
      return importer.settings.languages
        .flatMap(async languageCode => {
          const defaultData = await defaultDataP
          const langData: Item & { type: 'venue' } = await importer.store.get(`venue:${id}:${languageCode}`)
          return util.defaults(defaultData, util.defaults({ language: languageCode }, langData)) as typeof langData
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

const savePerformers = async (importer: Importer) => {
  const ids: Array<Item['id']> = (await importer.store.get('performer-ids')) || []
  const constructed = await util.settle(
    ids.flatMap(id => {
      const defaultDataP: Promise<Item & { type: 'performer' }> = importer.store.get(`performer:${id}:${importer.settings.defaultLanguage}`)
      return importer.settings.languages
        .flatMap(async languageCode => {
          const defaultData = await defaultDataP
          const langData: Item & { type: 'performer' } = await importer.store.get(`performer:${id}:${languageCode}`)
          const sessionIds: Performer['data']['sessionIds'] = (await importer.store.get(`performer2sessions:${id}`)) || []
          const venueIds: Performer['data']['venueIds'] = (await importer.store.get(`performer2venues:${id}`)) || []
          return util.defaults(defaultData, util.defaults({ language: languageCode, data: { sessionIds, venueIds } }, langData)) as typeof langData
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

const saveSessions = async (importer: Importer) => {
  const ids: Array<Item['id']> = (await importer.store.get('session-ids')) || []
  const constructed = await util.settle(
    ids.flatMap(id => {
      const defaultDataP: Promise<Item & { type: 'session' }> = importer.store.get(`session:${id}:${importer.settings.defaultLanguage}`)
      return importer.settings.languages
        .flatMap(async languageCode => {
          const defaultData = await defaultDataP
          const langData: Item & { type: 'session' } = await importer.store.get(`session:${id}:${languageCode}`)
          const performers = (
            await Promise.all(
              util
                .uniq([
                  ...(defaultData?.data.performerIds ?? []),
                  ...(langData?.data.performerIds ?? []),
                ])
                .map(
                  async id =>
                    util.defaults(
                      await importer.store.get(
                        `performer:${id}:${languageCode}`
                      ),
                      await importer.store.get(
                        `performer:${id}:${importer.settings.defaultLanguage}`
                      )
                    ) as Item & { type: 'performer' }
                )
            )
          ).filter(x => x)
          const venue = (
            await Promise.all(
              util
                .uniq([
                  ...(defaultData?.data.venueId ?? []),
                  ...(langData?.data.venueId ?? []),
                ])
                .map(
                  async id =>
                    util.defaults(
                      await importer.store.get(`venue:${id}:${languageCode}`),
                      await importer.store.get(
                        `venue:${id}:${importer.settings.defaultLanguage}`
                      )
                    ) as Item & { type: 'venue' }
                )
            )
          ).filter(x => x)[0]
          const performerNames = performers.map(x => x.data.name).filter(x => x)
          const subsessionIds: string[] = [] // TODO
          const venueName = venue?.data.name
          return util.defaults(defaultData, util.defaults({ language: languageCode, data: { hasParent: false, performerIds: [], performerNames, subsessionIds, venueName } }, langData)) as typeof langData
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

export const upload = async (importer: Importer) => {
  importer.progressTitle = updateProgress('savingToDatabase')
  await saveSessions(importer)
  await saveLanguages(importer)
  await saveVenues(importer)
  await savePerformers(importer)
  importer.progressTitle = updateProgress('finished')
  importer.endAt = new Date()
  importer.endTime = new Date()
  await saveImporterState(importer)
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
  data: Partial<entity.Performer>
}
export interface Session {
  type: 'session'
  data: Partial<entity.Session>
}
export interface Venue {
  type: 'venue'
  data: Partial<entity.Venue>
}
export type Item = { id: string; type: string; language: string; } & (Performer | Session | Venue)
export interface Settings {
  /** cs, en, ... */
  languages: string[]
  /** cs, en, ... */
  defaultLanguage: string
  /** memory story by default, @see {@link createMemoryStore} */
  store?: {
    set: (key: string, val: any) => void
    get: (key: string) => Promise<any>
  }
}
export type Importer = util.Unpromise<ReturnType<typeof createImporter>>

export const createError = (i: Importer, name: 'no-validation-schema' | 'invalid-item-data', opts?: { error?: any, item?: Item }) => {
  return Object.assign(
    new Error(name),
    {
      importer: i,
      ...opts,
    }
  )
}
