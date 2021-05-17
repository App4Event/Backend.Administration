import * as http from 'http'
import * as eventImport from './event-import'
import * as firestore from './firestore'
export * from './entity'
export { EventImporter, Item as ImportItem, sanitizeCustomFields } from './event-import'
export * as filmchief from './filmchief'
export { FilmChiefConnection, Image as FilmChiefImage } from './filmchief'
export { onImportCreated, onImportRequest } from './functions'
export * as util from './util'
export { eventImport }

export const createBackend = (settings: {
  event: eventImport.Settings,
  import: (i: eventImport.EventImporter) => Promise<void>
}) => {
  return {
    onImportRequest: async (_req: http.IncomingMessage, res: http.ServerResponse) => {
      const i = await eventImport.createImporter(settings.event)
      await eventImport.createImport(i)
      res.end()
    },
    onImportCreated: async (snap: { data: () => any }) => {
      const state: eventImport.SavedState = (await snap.data())
      const parsedState = firestore.revertFirestoreKeys(state, { dates: ['endAt', 'endTime', 'startAt', 'startTime'] })
      const i = await eventImport.createImporterFromState(settings.event, parsedState)
      await eventImport.startLoading(i, settings.import)
    },
    runImport: async (subsettings?: Pick<eventImport.Settings, 'trackOnlyDataInFirestore'>) => {
      const i = await eventImport.createImporter({
        ...settings.event,
        ...subsettings,
      })
      // TODO use createImporterFromState to make sure it works fine
      await eventImport.startLoading(i, settings.import)
    },
  }
}
