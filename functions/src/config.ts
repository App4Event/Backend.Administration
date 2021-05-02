import * as configuru from 'configuru'
import * as path from 'path'
import * as cosmas from 'cosmas'

const value = configuru.createLoader({
    defaultConfigPath: path.join(__dirname, '../.env.jsonc'),
    // TODO Uncomment
    // userConfigPath: path.join(__dirname, '../credentials.json'),
})

const config = {
    logger: {
        defaultLevel: value.custom((x: any) => x as cosmas.Level)('LOGGER_DEFAULT_LEVEL'),
        pretty: value.bool('LOGGER_PRETTY'),
    },
    filmChief: {
        baseUrl: value.string('FILMCHIEF_URL'),
        festivalIdentifier: value.string('FILMCHIEF_FESTIVAL_DOMAIN'),
        apiKey: value.string.hidden('FILMCHIEF_API_KEY'),
    },
}

const values = configuru.values(config)

export type Config = typeof values;

export default values
