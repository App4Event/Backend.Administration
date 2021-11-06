import Airtable, { FieldSet } from 'airtable'

export type Connection = ReturnType<typeof connect>

export const connect = (opts: {
    apiKey: string
    /** base id */
    base: string
}) => {
    const instance = new Airtable({
        apiKey: opts.apiKey,
    })
    return {
        airtable: instance,
        base: instance.base(opts.base),
    }
}

export interface TableRow<TRow> {
  id: string
  data: Partial<TRow>
  row: Airtable.Record<FieldSet>
}

export interface Image {
  id: string
  width: number
  height: number
  url: string
  filename: string
  size: number
  type: string
  thumbnails: Array<{
    small: ImageThumbnail
    large: ImageThumbnail
    full: ImageThumbnail
  }>
}

interface ImageThumbnail {
  url: string
  width: number
  height: number
}

export const tableRows = async <TRow = any>(conn: Connection, tableName: string) => {
    const result = conn.base.table(tableName).select()
    const all = await result.all()
    return all.map((x): TableRow<TRow> => {
        return {
            id: x.id,
            data: x.fields as unknown as TRow,
            row: x,
        }
    })
}
