declare module 'csv-parser' {
  import { Transform } from 'stream';
  interface CsvParserOptions {
    separator?: string;
    headers?: string[] | boolean;
    skipLines?: number;
    mapHeaders?: (args: { header: string; index: number }) => string;
    mapValues?: (args: { header: string; index: number; value: string }) => any;
  }
  function csvParser(options?: CsvParserOptions): Transform;
  export = csvParser;
}
