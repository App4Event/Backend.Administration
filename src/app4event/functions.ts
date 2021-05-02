import * as http from 'http'
import * as eventImport from './event-import'

export const onImportRequest = (importSettings: eventImport.Settings) => {
    return async (_req: http.IncomingMessage, res: http.ServerResponse) => {
      await eventImport.createImport(
        await eventImport.createImporter(importSettings)
      )
      res.end()
    }
}

export const onImportCreated = <T extends any[]>(
    getImporterData: (...x: T) => Promise<eventImport.EventImporter>,
    runImport: (importer: eventImport.EventImporter) => Promise<any>
) => {
    return async (...x: T) => {
        const i = await getImporterData(...x)
        await runImport(i)
    }
}
