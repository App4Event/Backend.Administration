import * as http from 'http'
import * as eventImport from './event-import'
import * as firestore from './firestore'
import * as pushNotifs from './push-notifs'
export * as airtable from './airtable'
export * from './entity'
export {
  EventImporter,
  Item as ImportItem,
  Performer as ImportPerformer,
  Venue as ImportVenue,
  Session as ImportSession,
  Group as ImportGroup,
  Day as ImportDay,
  VenueCategory as ImportVenueCategory,
  Highlight as ImportHighlight,
  sanitizeCustomFields,
} from './event-import'
export * as filmchief from './filmchief'
export { FilmChiefConnection } from './filmchief'
export { onImportCreated, onImportRequest } from './functions'
export * as util from './util'
export { eventImport }

export const createBackend = (settings: {
  event: eventImport.Settings
  import: (i: eventImport.EventImporter) => Promise<void>
}) => {
  return {
    importProbe: eventImport.probe,
    notificationProbe: pushNotifs.probe,
    onImportRequest: cors(
      async (_req: http.IncomingMessage, res: http.ServerResponse) => {
        const i = await eventImport.createImporter({
          ...settings.event,
          trackOnlyDataInFirestore: true,
        })
        await eventImport.createImport({
          ...i,
          trackOnlyDataInFirestore: false,
        })
        res.end()
      }
    ),
    onImportCreated: async (snap: { data: () => any }) => {
      const state: eventImport.SavedState = await snap.data()
      const parsedState = firestore.revertFirestoreKeys(state, {
        dates: ['endAt', 'endTime', 'startAt', 'startTime'],
      })
      const i = await eventImport.createImporterFromState(
        settings.event,
        parsedState
      )
      await eventImport.startLoading(i, settings.import)
    },
    onNewsCreated: async (newsId: string, langCode: string, newsData: any) => {
      await pushNotifs.onNewsCreated(newsId, langCode, newsData)
    },
    publishDelayedNews: async () => {
      await pushNotifs.publishDelayedNews(settings.event.languages)
    },
    runImport: async (
      subsettings?: Pick<eventImport.Settings, 'trackOnlyDataInFirestore'>
    ) => {
      const importerSettings: eventImport.Settings = {
        ...settings.event,
        ...subsettings,
      }
      let i = await eventImport.createImporter(importerSettings)
      if (!subsettings?.trackOnlyDataInFirestore) {
        const result = await eventImport.createImport(i)
        i.importId = result.importId
      }
      i = await eventImport.createImporterFromState(importerSettings, i)
      await eventImport.startLoading(i, settings.import)
    },
  }
}

function cors<T>(
  cb: (req: http.IncomingMessage, res: http.ServerResponse) => T
) {
  return (req: http.IncomingMessage, res: http.ServerResponse) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    if (req.method?.toLocaleLowerCase() === 'options') {
      res.end()
      return
    }
    return cb(req, res)
  }
}
