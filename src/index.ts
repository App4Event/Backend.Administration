import { airtable } from './airtable'
import { httpApi } from './http-api'
import { etl } from './etl'

export type { Extract } from './etl/extract'
export type { TableRow } from './airtable/table-rows'
const airtableLib = {
  FindBaseSchemaError: airtable.FindBaseSchemaError,
  findBaseSchema: airtable.findBaseSchema,
  FindTableRowsError: airtable.FindTableRowsError,
  findAllTableRows: airtable.findAllTableRows,
}

const httpApiLib = {
  request: httpApi.request,
  cached: httpApi.cached,
  clearCache: httpApi.clearCache,
}

const etlLib = {
  extractSources: etl.extractSources,
  loadToFirestore: etl.loadToFirestore,
  transform: etl.transform,
}

const lib = {
  airtable: airtableLib,
  httpApi: httpApiLib,
  etl: etlLib,
}

export { airtableLib as airtable }
export { httpApiLib as httpApi }
export { etlLib as etl }

export default lib
