import * as config from '../config'
import got from 'got'
import * as util from './util'

export interface Image {
  id: string;
  fileExists: boolean;
  fileName: string;
  fileUrl: string;
  /**
   * Preferred URL
   *
   * example: //filmchief.com/festivals/festivalname/files/img-999a999a9aa9.jpg
   **/
  originalFileUrl: string;
  tag?: null;
  tags?: null;
}

/**
 * Format image url into a valid URL if possible.
 *
 * URLs I have encountered in FC starts without a schema.
 * @param image
 * @returns
 */
const parseImageUrl = (image?: Image) => {
  if (!image) return
  if (image.originalFileUrl.startsWith('//')) {
    return `https:${image.originalFileUrl}`
  }
  return image.originalFileUrl
}

export const getImage = async (fc: FilmChiefConnection, imageId: number) => {
  const result = await util.settle([
    fc.request.get<{ data?: Image }>({
      url: '',
      searchParams: {
        proc: 'getImage',
        uploadedFileID: imageId,
      },
      responseType: 'json',
    }),
  ])
  const response = result.results[0]
  const error = result.errors[0]
  const image = response?.body.data
  const url = parseImageUrl(image)
  return {
    url,
    image,
    response,
    error,
  }
}

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
