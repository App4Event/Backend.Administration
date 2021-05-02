
import * as openapi from './openapi'
import * as ajv from 'ajv'
import * as eventImport from './event-import'
import * as util from './util'

const validator = new (ajv.default)()

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
