import { FirestoreEntity } from './load'

export interface ImportEntity<T extends Record<string, any>> {
  id: string
  data: T
}

export interface ImportLocalizedEntity<T extends Record<string, any>>
  extends ImportEntity<T> {
  language: string
}

export type TagReference = string

export interface CustomField {
  name?: string
  value?: string
}

export interface UriImage {
  url?: string
}

export interface ResizinImage {
  id?: string
}

export type ImageReference = UriImage | ResizinImage

export enum ImportLinkType {
  Http,
  Facebook,
  Twitter,
  Youtube,
  Vimeo,
  Soundcloud,
  Linkedin,
  Csfd,
  Imdb,
}

export interface Link {
  uri?: string
  type?: ImportLinkType
}

export type ImportPerformer = ImportLocalizedEntity<{
  name?: string
  description?: string
  title?: string
  tags?: TagReference[]
  customFields?: CustomField[]
  images?: ImageReference[]
  links?: Link[]
}>

export interface ImportCustomRecord extends FirestoreEntity<any> {}
