import * as openapi from './openapi'

export type Link = openapi.types.components['schemas']['Link']
export type Language = openapi.types.components['schemas']['Language']
export type Performer = openapi.types.components['schemas']['Performer']
export type Session = openapi.types.components['schemas']['Session']
export type CustomField = openapi.types.components['schemas']['CustomField']
export type Image = openapi.types.components['schemas']['Image']

// interface HttpImage {
//   uri: string
// }

// interface ImageServerImage {
//   id: string
// }

// export interface CustomField {
//   name: string
//   value: string
// }

// type Image = HttpImage | ImageServerImage

type Tag = string

// export interface Session {
//   id: string
//   performerId?: Performer['id']
//   venueId?: Venue['id']
// }

export type Venue = openapi.types.components['schemas']['Venue']

// export interface Venue {
//   id: string
//   name: string
//   order: number
//   description?: string
//   location?: {
//     lat: number
//     lng: number
//   },
//   // TODO Color type/format
//   color?: string
//   links?: Link[]
//   customFields?: CustomField[]
// }

// export interface Performer {
//   id: string
//   name: string
//   title: string
//   description: string
//   images: Image[]
//   customFields: CustomField[]
//   tags: Tag[]
//   sessionIds: Array<Session['id']>
//   venueIds: Array<Venue['id']>
//   links: Link[]
//   updateTime: Date
// }
