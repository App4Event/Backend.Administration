
import * as openapi from './openapi'
import * as ajv from 'ajv'
import * as eventImport from './event-import'
import * as util from './util'

const validator = new (ajv.default)()

// Register all cross referenced schemas in order to fix
// ajv error `can't resolve reference from id #`
validator.addSchema(openapi.schema.components.schemas.Image, '#/components/schemas/Image')
validator.addSchema(openapi.schema.components.schemas.CustomField, '#/components/schemas/CustomField')
validator.addSchema(openapi.schema.components.schemas.Link, '#/components/schemas/Link')

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
    return undefined
})

export const validate = async (importer: eventImport.EventImporter, item: eventImport.Item) => {
    await 1
    const validate = createCompiledSchemaForType(item.type)
    if (!validate) {
        throw eventImport.createError(importer, 'no-validation-schema')
    }
    validate(item.data)
    if (!validate.errors) return item
    throw eventImport.createError(importer, 'invalid-item-data', { item, error: validate.errors })
}
