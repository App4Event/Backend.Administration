import * as eventImport from './event-import'

export const NO_VALIDATION_SCHEMA = 'no-validation-schema'
export const INVALID_ITEM_DATA = 'invalid-item-data'
export const NO_ITEM_DATA = 'no-item-data'
export const LOADING_DATA_FAILED = 'loading-data-failed'
export const INVALID_ITEM_REFERENCE = 'invalid-item-reference'
export const DELETED_DATABASE_ITEM = 'deleted-database-item'
export const IMAGE_REUPLOAD_FAILED = 'image-reupload-failed'
export const SESSION_OUT_OUF_BOUNDS = 'session-out-of-bounds'
export const MISSING_VENUE_CATEGORIES = 'missing-venue-categories'

export const createImportError = (
  i: eventImport.EventImporter,
  name:
    | typeof NO_VALIDATION_SCHEMA
    | typeof INVALID_ITEM_DATA
    | typeof NO_ITEM_DATA
    | typeof LOADING_DATA_FAILED
    | typeof INVALID_ITEM_REFERENCE
    | typeof DELETED_DATABASE_ITEM
    | typeof IMAGE_REUPLOAD_FAILED
    | typeof SESSION_OUT_OUF_BOUNDS
    | typeof MISSING_VENUE_CATEGORIES,
  opts?: { error?: any; item?: eventImport.Item }
) => {
  return Object.assign(new Error(name), {
    importer: i,
    ...opts,
  })
}

export const createSessionOutOfBoundsError = (
  item: eventImport.Item,
  reason: 'session-out-of-day',
  dayBounds: readonly [Date, Date] | undefined,
  sessionBounds: [Date, Date]
) => {
  return Object.assign(new Error(SESSION_OUT_OUF_BOUNDS), {
    item,
    reason,
    dayBounds,
    sessionBounds,
  })
}

export type SessionOutOfBoundsError = ReturnType<typeof createSessionOutOfBoundsError>

export type ImportError = ReturnType<typeof createImportError>
