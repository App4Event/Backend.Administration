import * as config from '../config'
import got from 'got'
import * as util from './util'

export const connectFilmChief = async (settings?: Partial<config.Config['filmChief']>) => {
  const apiKey = settings?.apiKey ?? config.default.filmChief.apiKey
  const festivalIdentifier =
    settings?.festivalIdentifier ?? config.default.filmChief.festivalIdentifier
  const baseUrl = settings?.baseUrl ?? config.default.filmChief.baseUrl

  const url = `https://${festivalIdentifier}.${baseUrl}/api/php`
  const { body } = await got<any>(url, {
    responseType: 'json',
    searchParams: { key: apiKey },
  })
  return {
    /** Authorization token */
    token: body.token as string,
    request: got.extend({
      prefixUrl: `${url}/Reader`,
      searchParams: {
        token: body.token,
      },
    }),
  }
}

export type FilmChiefConnection = util.Unpromise<ReturnType<typeof connectFilmChief>>
