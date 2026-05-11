declare module "n3" {
  export class Parser {
    constructor(options?: { baseIRI?: string })
    parse(source: string): Array<{
      subject: { value?: string }
      predicate: { value?: string }
      object: { value?: string; termType?: string }
    }>
  }
}
