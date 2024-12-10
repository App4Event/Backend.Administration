
import * as openapi from './openapi'
import * as ajv from 'ajv'
import * as eventImport from './event-import'
import * as util from './util'
import * as errors from './errors'

const validator = new (ajv.default)()

// Register all cross referenced schemas in order to fix
// ajv error `can't resolve reference from id #`
validator.addSchema(openapi.schema.components.schemas.Image, '#/components/schemas/Image')
validator.addSchema(openapi.schema.components.schemas.CustomField, '#/components/schemas/CustomField')
validator.addSchema(openapi.schema.components.schemas.Link, '#/components/schemas/Link')
validator.addSchema(openapi.schema.components.schemas.Location, '#/components/schemas/Location')
validator.addSchema(openapi.schema.components.schemas.Tag, '#/components/schemas/Tag')
validator.addSchema(openapi.schema.components.schemas.UriImage, '#/components/schemas/UriImage')
validator.addSchema(openapi.schema.components.schemas.ResizinImage, '#/components/schemas/ResizinImage')
validator.addSchema(openapi.schema.components.schemas.VenueCategory, '#/components/schemas/VenueCategory')
validator.addSchema(openapi.schema.components.schemas.VenueVenueCategory, '#/components/schemas/VenueVenueCategory')
validator.addSchema(openapi.schema.components.schemas.VenueCategoryLayout, '#/components/schemas/VenueCategoryLayout')

const createCompiledSchemaForType = util.memoize((type: eventImport.Item['type']) => {
    if (type === 'performer') {
        return validator.compile(openapi.schema.components.schemas.Performer)
    }
    if (type === 'venue') {
        return validator.compile(openapi.schema.components.schemas.Venue)
    }
    if (type === 'session') {
        return validator.compile(openapi.schema.components.schemas.Session)
    }
    if (type === 'group') {
        return validator.compile(openapi.schema.components.schemas.Group)
    }
    if (type === 'language') {
        return validator.compile(openapi.schema.components.schemas.Language)
    }
    if (type === 'day') {
        return validator.compile(openapi.schema.components.schemas.Day)
    }
    if (type === 'venueCategory') {
        return validator.compile(openapi.schema.components.schemas.VenueCategory)
    }
    return undefined
})

export const validate = async <TItem extends eventImport.Item>(importer: eventImport.EventImporter, item: TItem) => {
    await 1
    const validate = createCompiledSchemaForType(item.type)
    if (!validate) {
        throw errors.createImportError(importer, errors.NO_VALIDATION_SCHEMA, { item })
    }
    validate(item.data)
    if (!validate.errors) return item
    throw errors.createImportError(importer, errors.INVALID_ITEM_DATA, { item, error: validate.errors })
}
