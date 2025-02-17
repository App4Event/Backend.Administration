import { httpApi, HttpApiRequestFunction } from '../http-api'
import { requestWithApiKeyAuthorization } from './authorization'

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

export class FindBaseSchemaError extends Error {}

/**
 * @see https://airtable.com/developers/web/api/get-base-schema
 */
export const findBaseSchema = async (
  airtableApiKey: string,
  baseId: string,
  request: HttpApiRequestFunction = httpApi.request,
): Promise<BaseSchema> => {
  const { response } = await requestWithApiKeyAuthorization(
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
    throw new FindBaseSchemaError(response.text)
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
