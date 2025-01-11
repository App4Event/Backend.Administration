import { HttpApiFetch } from '../http-api'
import { withApiKey } from './request'

export interface BaseSchema {
  tables: TableSchema[]
}

export interface TableSchema {
  name: string
  fields: FieldSchema[]
}

export interface FieldSchema {
  name: string
}

export class FetchBaseSchemaError extends Error {}

export const fetchBaseSchema = async (
  request: HttpApiFetch,
  airtableApiKey: string,
  baseId: string
): Promise<BaseSchema> => {
  const { response } = await withApiKey(
    airtableApiKey,
    request
  )({
    url: 'https://api.airtable.com/v0/meta/bases/{baseId}/tables'.replace(
      '{baseId}',
      baseId
    ),
    method: 'GET',
  })
  if (response.status !== 200) {
    throw new FetchBaseSchemaError(response.text)
  }
  const res = JSON.parse(response.text)
  return {
    tables: res.tables.map((table: any) => {
      return {
        name: table.name,
        fields: table.fields.map((field: any) => {
          return {
            name: field.name,
          }
        }),
      }
    }),
  }
}
