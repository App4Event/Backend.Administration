import * as eventImport from './event-import'

export const NO_VALIDATION_SCHEMA = 'no-validation-schema'
export const INVALID_ITEM_DATA = 'invalid-item-data'
export const NO_ITEM_DATA = 'no-item-data'
export const LOADING_DATA_FAILED = 'loading-data-failed'
export const INVALID_ITEM_REFERENCE = 'invalid-item-reference'
export const DELETED_DATABASE_ITEM = 'deleted-database-item'

export const createImportError = (
  i: eventImport.EventImporter,
  name:
    | typeof NO_VALIDATION_SCHEMA
    | typeof INVALID_ITEM_DATA
    | typeof NO_ITEM_DATA
    | typeof LOADING_DATA_FAILED
    | typeof INVALID_ITEM_REFERENCE
    | typeof DELETED_DATABASE_ITEM,
  opts?: { error?: any; item?: eventImport.Item }
) => {
  return Object.assign(new Error(name), {
    importer: i,
    ...opts,
  })
}

export type ImportError = ReturnType<typeof createImportError>
