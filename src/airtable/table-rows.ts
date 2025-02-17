import { httpApi, HttpApiRequestFunction } from '../http-api'
import { requestWithApiKeyAuthorization } from './authorization'

export class FindTableRowsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FindTableRowsError'
  }
}

interface ResponseDataRecord {
  /** Record ID */
  id: string
  /**
   * Cell values are keyed by either field name or field ID (conditioned on returnFieldsByFieldId).
   * @see https://airtable.com/developers/web/api/field-model
   **/
  fields: Record<string, any>
  /** A date timestamp in the ISO format, eg:"2018-01-01T00:00:00.000Z" */
  createdTime: string
}

export interface ListTableRecordsResponse {
  offset?: string
  records: ResponseDataRecord[]
}

/**
 * @see https://airtable.com/developers/web/api/list-records
 */
export const listTableRecords = async (
  baseId: string,
  tableIdOrName: string,
  apiKey: string,
  request: HttpApiRequestFunction = httpApi.request,
  offset?: string
) => {
  const url = new URL(
    'https://api.airtable.com/v0/{baseId}/{tableIdOrName}'
      .replace('{baseId}', baseId)
      .replace('{tableIdOrName}', tableIdOrName)
  )
  if (offset) {
    url.searchParams.set('offset', offset)
  }
  const { response } = await requestWithApiKeyAuthorization(
    apiKey,
    request
  )({
    url: url.toString(),
    method: 'GET',
  })
  if (response.status !== 200) {
    throw new FindTableRowsError(response.text)
  }
  return JSON.parse(response.text) as ListTableRecordsResponse
}

export interface TableRow {
  id: string
  createTime: Date
  fields: Record<string, any>
}

export const findAllTableRows = async (
  baseId: string,
  tableIdOrName: string,
  apiKey: string,
  request: HttpApiRequestFunction = httpApi.request
) => {
  let offset: string | undefined
  const rows: TableRow[] = []
  do {
    const page = await listTableRecords(
      baseId,
      tableIdOrName,
      apiKey,
      request,
      offset
    )
    offset = page.offset
    page.records.forEach((x) => {
      rows.push({
        id: x.id,
        createTime: new Date(x.createdTime),
        fields: x.fields,
      })
    })
  } while (offset)
  return rows
}
