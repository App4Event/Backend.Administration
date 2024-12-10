import * as entity from './entity'
import * as util from './util'
import * as firestore from './firestore'
import * as ISO6391 from 'iso-639-1'
import * as uuid from 'uuid'
import * as errors from './errors'
import { addItems, constructItems, createMemoryStore, ensureError, populateId, probe, reportSessionsOutOfBounds, sanitizeCustomFields, sanitizeLinks, SavedState, saveImporterState, startDataLoadProgress, updateProgress, validateItems } from './event-import-utils'

export {
  addItems,
  probe,
  sanitizeCustomFields,
  sanitizeLinks,
  SavedState,
}

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
    usePerformerNameAsSessionName: settings.usePerformerNameAsSessionName ?? false,
    /** Legacy for startTime/endTime */
    startAt: new Date(),
    endAt: undefined as Date | undefined,
    errors: [] as Error[],
    warnings: [] as Error[],
    invalidEntity: {
      session: {} as Record<string, Session>,
      performer: {} as Record<string, Performer>,
      venue: {} as Record<string, Venue>,
      group: {} as Record<string, Group>,
      language: {} as Record<string, Language>,
      day: {} as Record<string, Day>,
      venueCategory: {} as Record<string, VenueCategory>,
    },
    errorReportExamples: settings.errorReportExamples ?? 1,
  }
  await saveImporterState(i)
  i.progress = updateProgress('ready')
  await saveImporterState(i)
  return i
}

export const createImporterFromState = async (settings: Settings, state: Partial<SavedState>) => {
  const f = firestore.connectFirestore()
  const i = {
    importId: state.importId ?? '',
    settings,
    store: settings.store ?? createMemoryStore(),
    startTime: state.startTime ?? new Date(),
    endTime: state.endTime ?? undefined as Date | undefined,
    progress: updateProgress('ready'),
    firestore: f,
    trackOnlyDataInFirestore: settings.trackOnlyDataInFirestore ?? false,
    usePerformerNameAsSessionName: settings.usePerformerNameAsSessionName ?? false,
    startAt: state.startAt ?? new Date(),
    endAt: state.endAt ?? undefined as Date | undefined,
    errors: [] as Error[],
    warnings: [] as Error[],
    invalidEntity: {
      session: {} as Record<string, Session>,
      performer: {} as Record<string, Performer>,
      venue: {} as Record<string, Venue>,
      group: {} as Record<string, Group>,
      language: {} as Record<string, Language>,
      day: {} as Record<string, Day>,
      venueCategory: {} as Record<string, VenueCategory>,
    },
    errorReportExamples: settings.errorReportExamples ?? 1,
  }
  probe.importStarted(i)
  await saveImporterState(i)
  return i
}

export const deleteUnreferenced = async (importer: EventImporter) => {
  probe.deletingUnreferencedDocuments(importer)
  await pruneLanguagesCollection('performer')
  await pruneLanguagesCollection('session')
  await pruneLanguagesCollection('venue')
  await pruneLanguagesCollection('group')
  await pruneLanguagesCollection('day')
  await pruneLanguagesCollection('venueCategory')

  async function getKeepIds(ent: Item['type']) {
    const downloadedIds: string[] = await importer.store.get(`${ent}-ids`) ?? []
    const invalidIds = Object.keys(importer.invalidEntity[ent])
    return util.difference(downloadedIds, invalidIds)
  }
  function getEntityCollection(ent: Exclude<Item['type'], 'language'>) {
    const choices: Record<typeof ent, any> = {
      performer: firestore.path['/languages/{lang}/performers'],
      session: firestore.path['/languages/{lang}/sessions'],
      venue: firestore.path['/languages/{lang}/venues'],
      group: firestore.path['/languages/{lang}/groups'],
      day: firestore.path['/languages/{lang}/days'],
      venueCategory: firestore.path['/languages/{lang}/venueCategories'],
    }
    return choices[ent]
  }
  /**
   * @param path Those only with { lang } input
   */
  async function pruneLanguagesCollection(ent: Exclude<Item['type'], 'language'>) {
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

const saveLanguages = async (importer: EventImporter) => {
  const languages: Language[] = importer.settings.languages.map((languageCode) => {
    return {
      id: languageCode,
      type: 'language',
      language: languageCode,
      data: {
        isDefault: languageCode === importer.settings.defaultLanguage,
        name:
          ISO6391.default.getNativeName(
            languageCode
          ) || languageCode,
        id: languageCode,
      },
    }
  })
  await addItems(importer, languages)
  probe.savingItemsOfType({ importer, type: 'language' })
  const validated = await validateItems(importer, languages)
  await Promise.allSettled(
    validated.results.map(x => firestore.save(
        importer.firestore,
        firestore.path['/languages/{lang}/']({ lang: x.id }),
        x.data
      ))
  )
  probe.savedItemsOfType({ importer, type: 'language' })
}

const saveDays = async (importer: EventImporter) => {
  probe.savingItemsOfType({ importer, type: 'day' })
  const constructed = await constructItems(importer, 'day', (item, meta) => {
    return {
      ...item,
      language: meta.languageCode,
      data: {
        ...item?.data,
        id: meta.id,
      },
    }
  })
  const validated = await validateItems(importer, constructed.results)
  await util.settle(
    validated.results.map(item =>
      firestore.save(
        importer.firestore,
        firestore.path['/languages/{lang}/days/{id}']({ lang: item.language, id: item.id }),
        firestore.convertFirstoreKeys(item.data, { dates: ['timeFrom', 'timeTo'] })
      )
    )
  )
  probe.savedItemsOfType({ importer, type: 'day' })
}

const venueCategoryLayout = (layout: unknown): entity.VenueCategoryLayout => {
  if (layout === 'LARGE') {
    return 'LARGE'
  }
  return 'COMPACT'
}

const saveVenueCategories = async (importer: EventImporter) => {
  probe.savingItemsOfType({ importer, type: 'venueCategory' })
  const constructed = await constructItems(importer, 'venueCategory', (item, meta) => {
    return {
      ...item,
      language: meta.languageCode,
      data: {
        ...item?.data,
        id: meta.id,
        layout: venueCategoryLayout(item.data.layout),
      },
    }
  })
  const validated = await validateItems(importer, constructed.results)
  await util.settle(
    validated.results.map(item =>
      firestore.save(
        importer.firestore,
        firestore.path['/languages/{lang}/venueCategories/{id}']({ lang: item.language, id: item.id }),
        item.data
      )
    )
  )
  probe.savedItemsOfType({ importer, type: 'venueCategory' })
}

const saveVenues = async (importer: EventImporter) => {
  probe.savingItemsOfType({ importer, type: 'venue' })
  const constructed = await constructItems(importer, 'venue', async (item, meta) => {
    const customFields = sanitizeCustomFields(item.data.customFields)
    const links = sanitizeLinks(item.data.links)
    const categories = await populateId(importer, 'venueCategory', item.data.categoryIds, meta.languageCode)
    if (!categories?.length) {
      importer.warnings.push(errors.createImportError(importer, errors.MISSING_VENUE_CATEGORIES, { item }))
    }

    return {
      ...item,
      language: meta.languageCode,
      data: {
        ...item?.data,
        id: meta.id,
        order: item.data.order ?? meta.index,
        categoryIds: undefined,
        categories: categories.map(category => ({
          id: category.id,
          name: category.data.name ?? ''  ,
          color: category.data.color ?? '',
          iconUnicode: category.data.iconUnicode ?? '',
          layout: category.data.layout ?? 'COMPACT',
        })),
        customFields,
        links,
      },
    }
  })
  const validated = await validateItems(importer, constructed.results)
  await util.settle(
    validated.results.map(item =>
      firestore.save(
        importer.firestore,
        firestore.path['/languages/{lang}/venues/{id}']({ lang: item.language, id: item.id }),
        firestore.convertFirstoreKeys(item.data, { geoPoints: ['location'] })
      )
    )
  )
  probe.savedItemsOfType({ importer, type: 'venue' })
}

const savePerformers = async (importer: EventImporter) => {
  probe.savingItemsOfType({ importer, type: 'performer' })
  const constructed = await constructItems(importer, 'performer', async (item, meta) => {
    const referencedSessionIds: Array<Session['data']['id']> = (await importer.store.get(`performer2sessions:${meta.id}`)) ?? []
    const referencedVenueIds: Array<NonNullable<Session['data']['venueId']>> = (await importer.store.get(`performer2venues:${meta.id}`)) ?? []
    const sessions = await populateId(importer, 'session', referencedSessionIds, meta.languageCode)
    const sessionIds = util.pluck(sessions, x => x?.data.id)
    const venues = await populateId(importer, 'venue', referencedVenueIds, meta.languageCode)
    const venueIds = util.pluck(venues, x => x.id)
    const customFields = sanitizeCustomFields(item.data.customFields)
    const links = sanitizeLinks(item.data.links)
    return {
      ...item,
      language: meta.languageCode,
      data: {
        ...item.data,
        id: meta.id,
        description: item.data.description ? util.stripHtml(item.data.description).trim() : item.data.description,
        sessionIds,
        venueIds,
        customFields,
        links,
      },
    }
  })
  const validated = await validateItems(importer, constructed.results)
  await util.settle(
    validated.results.map(item =>
      firestore.save(
        importer.firestore,
        firestore.path['/languages/{lang}/performers/{id}']({ lang: item.language, id: item.id }),
        item.data
      )
    )
  )
  probe.savedItemsOfType({ importer, type: 'performer' })
}

const saveSessions = async (importer: EventImporter) => {
  probe.savingItemsOfType({ importer, type: 'session' })
  const constructed = await constructItems(importer, 'session', async (item, meta) => {
    const performers = await populateId(importer, 'performer', item.data.performerIds, meta.languageCode)
    const venue = await populateId(importer, 'venue', item?.data.venueId, meta.languageCode)
    const subsessionIds = (await populateId(importer, 'session', item?.data.subsessionIds, meta.languageCode))
      ?.map(x => x.id) ?? []
    const parentIds: Array<Item['id']> = await importer.store.get(`session2parent:${item.id}`) ?? []
    const parents = await populateId(importer, 'session', parentIds, meta.languageCode)
    const performerNames = util.pluck(performers, x => x.data.name)
    const performerIds = util.pluck(performers, x => x.data.id)
    const customFields = sanitizeCustomFields(item.data.customFields)
    const venueName = venue?.data.name
    const venueId = venue?.id
    const parent = parents[0]
    let name = item.data.name
    // TODO Deprecate and introduce some `prefer`
    if (importer.usePerformerNameAsSessionName) {
      name = performerNames[0] || name
    } else {
      name = (name ?? '') || performerNames[0]
    }
    const images = item.data.images?.length
      ? item.data.images
      : (performers ?? [])
        .flatMap(x => x.data.images)
        .filter(x => x)
        .map(x => x!)
        .slice(0, 1)
    return {
      ...item,
      language: meta.languageCode,
      data: {
        ...item?.data,
        id: item.id,
        parentId: parent?.id,
        hasParent: !!parent,
        description: item.data.description ? util.stripHtml(item.data.description).trim() : item.data.description,
        subsessionIds,
        performerIds,
        performerNames,
        customFields,
        venueId,
        venueName,
        images,
        name,
      },
    }
  })
  const validated = await validateItems(importer, constructed.results)
  await reportSessionsOutOfBounds(importer, validated.results)
  await util.settle(
    validated.results.map(item =>
      firestore.save(
        importer.firestore,
        firestore.path['/languages/{lang}/sessions/{id}']({ lang: item.language, id: item.id }),
        firestore.convertFirstoreKeys(item.data, { dates: ['timeFrom', 'timeTo'] })
      )
    )
  )
  probe.savedItemsOfType({ importer, type: 'session' })
}

const saveGroups = async (importer: EventImporter) => {
  probe.savingItemsOfType({ importer, type: 'group' })
  const constructedAll = await constructItems(importer, 'group', async (item, meta) => {
    const sessionIds: Array<Item['id']> = await importer.store.get(`group2sessions:${item.id}`) ?? []
    const sessions = await populateId(importer, 'session', sessionIds, meta.languageCode)
    const performerIds: Array<Item['id']> = await importer.store.get(`group2performers:${item.id}`) ?? []
    const performers = await populateId(importer, 'performer', performerIds, meta.languageCode)
    return [
      sessions.length ? {
        ...item,
        language: meta.languageCode,
        data: {
          ...item?.data,
          type: 'SESSION',
          performerIds: undefined,
          sessionIds: sessions.map(x => x.id),
        },
      } : undefined,
      performers.length ? {
        ...item,
        language: meta.languageCode,
        data: {
          ...item?.data,
          type: 'PERFORMER',
          sessionIds: undefined,
          performerIds: performers.map(x => x.id),
        },
      } : undefined,
    ]
      .filter(x => x)
      .map(x => x!)
  })
  const constructed = { ...constructedAll, results: constructedAll.results.flatMap(x => x) }
  const validated = await validateItems(importer, constructed.results)
  await util.settle(
    validated.results.map(item =>
      firestore.save(
        importer.firestore,
        firestore.path['/languages/{lang}/groups/{id}']({ lang: item.language, id: item.id }),
        firestore.convertFirstoreKeys(item.data, {})
      )
    )
  )
  const constructedItems = await util.settle(
    constructed.results.flatMap(async group => {
      const sessionItems = (await populateId(importer, 'session', group.data.sessionIds, group.language)) ?? []
      const performerItems = (await populateId(importer, 'performer', group.data.performerIds, group.language)) ?? []
      return [...sessionItems, ...performerItems].map((x, i) => ({
        id: `${group.id}:${i}`,
        groupId: group.id,
        language: group.language,
        data: {
          ...x.data,
          order: i,
          detail: x.type === 'performer'
            ? firestore.path['/languages/{lang}/performers/{id}']({ lang: x.language, id: x.id })
            : firestore.path['/languages/{lang}/sessions/{id}']({ lang: x.language, id: x.id }),
        },
      }))
    })
  )
  await util.settle(
    constructedItems.results
      .flatMap(x => x)
      .map(item => {
        return firestore.save(
          importer.firestore,
          firestore.path['/languages/{lang}/groups/{groupId}/items/{id}']({ lang: item.language, groupId: item.groupId, id: item.id }),
          firestore.convertFirstoreKeys(item.data, { dates: ['timeFrom', 'timeTo'] as any[] /* session keys */ })
        )
      })
  )
  probe.savedItemsOfType({ importer, type: 'group' })
}

/**
 * Ran given tasks and after each update import progress of savingToDatabase.
 * E.g. savingToDatabase is 0.3-1, after 3/7 tasks progress will be 0.6
 */
const uploadLoading = (importer: EventImporter, tasks: Array<() => Promise<any> | any>) => {
  return tasks.reduce(async (last, task, i) => {
    await last
    importer.progress = updateProgress('savingToDatabase', { step: i + 1, maxSteps: tasks.length })
    await saveImporterState(importer)
    await task()
  }, Promise.resolve())
}

/**
 * Upload all stored data to Firestore.
 *
 * Entities ony by one, type by type are saved to database.
 */
export const upload = async (importer: EventImporter) => {
  importer.progress = updateProgress('savingToDatabase')
  await uploadLoading(importer, [
    () => saveLanguages(importer),
    () => saveDays(importer),
    () => saveVenueCategories(importer),
    () => saveVenues(importer),
    () => savePerformers(importer),
    () => saveSessions(importer),
    () => saveGroups(importer),
    () => deleteUnreferenced(importer),
  ])
  probe.importFinished(importer)
  importer.progress = updateProgress('finished')
  importer.endAt = new Date()
  importer.endTime = new Date()
  await saveImporterState(importer)
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
  const clearDataLoadProgress = startDataLoadProgress(importer)
  try {
    await load(importer)
  } catch (error) {
    importer.errors.push(errors.createImportError(importer, errors.LOADING_DATA_FAILED))
    probe.loadingDataFailed(ensureError(error))
    await saveImporterState(importer)
  } finally {
    clearDataLoadProgress()
  }
}

export type Venue = Item & { type: 'venue' }
export type Session = Item & { type: 'session' }
export type Performer = Item & { type: 'performer' }
export type Group = Item & { type: 'group' }
export type Language = Item & { type: 'language' }
export type Day = Item & { type: 'day' }
export type VenueCategory = Item & { type: 'venueCategory' }

export type Item = { id: string; type: string; language: string } & (
  | {
      type: 'performer'
      data: Partial<
        Omit<
          entity.Performer,
          'venueIds' /* Venue IDs are derived during import from related sessions */
        >
      > &
        Pick<entity.Performer, 'id'> & {
          groupId?: string /* Import will map this id to specified group */
        }
    }
  | {
      type: 'session'
      data: Partial<
        Omit<
          entity.Session,
          | 'venueName'
          | 'performerNames' /* Venue name, performer names are derived during import from related venue/performer */
        >
      > &
        Pick<entity.Session, 'id'> & {
          parentId?: string /* Allow to specify parent-child relation in reverse */
          groupId?: string /* Import will map this id to specified group */
        }
    }
  | {
      type: 'venue'
      data: Partial<entity.Venue> & Pick<entity.Venue, 'id'> & {
        categoryIds?: Array<string>
      }
    }
  | {
      type: 'day'
      data: Partial<entity.Day> & Pick<entity.Day, 'id'>
    }
  | {
      type: 'group'
      data: Partial<
        Omit<
          entity.Group,
          'type' /* Type is derived automatically from the ids during import */
        >
      > &
        Pick<entity.Group, 'id'>
    }
  | {
      type: 'language'
      data: Partial<entity.Language> & Pick<entity.Language, 'id'>
    }
  | {
      type: 'venueCategory'
      data: Partial<entity.VenueCategory> & Pick<entity.VenueCategory, 'id'>
    }
)
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
  },
  reuploadImage?: (image: entity.Image) => Promise<entity.Image | undefined>
  /**
   * If true, session.name will be overwritten with first performer name of the sesssion
   * (defined in its performerIds)
   * @default false
   */
  usePerformerNameAsSessionName?: boolean
  /**
   * Number of import examples to print for each entity during import.
   * Default: 1
   */
  errorReportExamples?: number
}
export type EventImporter = util.Unpromise<ReturnType<typeof createImporter>>
