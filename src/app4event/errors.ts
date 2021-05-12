import * as eventImport from './event-import'

export const NO_VALIDATION_SCHEMA = 'no-validation-schema'
export const INVALID_ITEM_DATA = 'invalid-item-data'
export const NO_ITEM_DATA = 'no-item-data'
export const createImportError = (
  i: eventImport.EventImporter,
  name:
    | typeof NO_VALIDATION_SCHEMA
    | typeof INVALID_ITEM_DATA
    | typeof NO_ITEM_DATA,
  opts?: { error?: any; item?: eventImport.Item }
) => {
  return Object.assign(new Error(name), {
    importer: i,
    ...opts,
  })
}
