import Airtable, { FieldSet } from 'airtable'
import * as EventImport from './event-import'
import * as util from './util'

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

/**
 * @example '2019-10-10T09:40:00.000Z'
 */
export type Date = string

/**
 * @returns All rows of selected table
 */
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

export const FieldType = {
  Date: (x: any) => util.createDate(x),
  String: (x: any) => x ? String(x) : undefined,
  Strings: (x: string[]) => x ?? [],
  References: (x: any) => x ? (x as string[]) : [],
  Any: (x: any) => x,
  Unknown: (x: unknown) => x,
  Attachments: (x: any): Image[] => x ?? [],
  Number: (x: any) => util.createNumber(x),
  Boolean: (x: any) => Boolean(x),
}

export const createTableImporter = <
TA4EEntity extends EventImport.Item,
TRowTemplate extends Record<keyof Record<string, unknown>, util.ValueOf<typeof FieldType>>
>(
  param: {
    rowTemplate: TRowTemplate
    createFromRow: (
      row: TableRow<{ [key in keyof TRowTemplate]: ReturnType<TRowTemplate[key]> }>,
      index: number
    ) => TA4EEntity[]
    table: string
  }
) => {
  function importData(importer: EventImport.EventImporter, airtable: Connection) {
    return addTableToImport(importer, airtable, param)
  }
  return importData
}

export const addTableToImport = async <
  TA4EEntity extends EventImport.Item,
  TRowTemplate extends Record<keyof Record<string, unknown>, util.ValueOf<typeof FieldType>>
>(
  importer: EventImport.EventImporter,
  airtable: Connection,
  param: {
    rowTemplate: TRowTemplate
    createFromRow: (
      row: TableRow<{ [key in keyof TRowTemplate]-?: ReturnType<TRowTemplate[key]> }>,
      index: number
    ) => TA4EEntity[]
    /** Airtable table name */
    table: string
  }
) => {
  const rowTemplateKeys = Object.keys(param.rowTemplate)
  const rowTemplate = <T extends TableRow<unknown>>(x: T) => {
    rowTemplateKeys.forEach(key => {
      // eslint-disable-next-line
      // @ts-expect-error
      x.data[key] = param.rowTemplate[key](x.data[key])
    })
    return x
  }
  const rows = await tableRows(airtable, param.table)
  const allEntities = rows.flatMap((x, i) => {
    const templated = rowTemplate(x)
    return param.createFromRow(templated, i)
  })
  await EventImport.addItems(importer, allEntities)
}
