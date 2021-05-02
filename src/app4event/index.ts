import * as eventImport from './event-import'
import * as functions from './functions'

export * from './entity'
export * as filmchief from './filmchief'
export { onImportRequest, onImportCreated } from './functions'
export { EventImporter } from './event-import'
export { FilmChiefConnection } from './filmchief'
export { Item as ImportItem } from './event-import'

export { eventImport }

export const createBackend = (settings: {
  event: eventImport.Settings,
  import: (i: eventImport.EventImporter) => Promise<void>
}) => {
  return {
    onImportRequest: functions.onImportRequest(settings.event),
    onImportCreated: functions.onImportCreated(
      (snap: { data: () => any }) => snap.data(),
      i => settings.import(i)
    ),
    runImport: async (subsettings?: Pick<eventImport.Settings, 'trackOnlyDataInFirestore'>) => {
      const i = await eventImport.createImporter({
        ...settings.event,
        ...subsettings,
      })
      await settings.import(i)
    },
  }
}
