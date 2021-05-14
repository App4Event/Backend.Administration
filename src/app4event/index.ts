import * as http from 'http'
import * as eventImport from './event-import'

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
      const i: eventImport.EventImporter = (await snap.data())
      await eventImport.startLoading(i, settings.import)
    },
    runImport: async (subsettings?: Pick<eventImport.Settings, 'trackOnlyDataInFirestore'>) => {
      const i = await eventImport.createImporter({
        ...settings.event,
        ...subsettings,
      })
      await eventImport.startLoading(i, settings.import)
    },
  }
}
