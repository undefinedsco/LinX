#!/usr/bin/env node
import './lib/node-warning-filter.js'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { buildLinxSymphonyCommandTree } from './lib/symphony-command.js'

const cli = buildLinxSymphonyCommandTree(yargs(hideBin(process.argv)))
  .scriptName('linx-symphony')
  .parserConfiguration({
    'populate--': true,
  })
  .demandCommand(1, 'Usage: linx-symphony <run|tasks|sessions|deliveries|show>')
  .strict()
  .help()
  .fail((message, error, yargsInstance) => {
    if (error) {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
    if (message) {
      console.error(message)
      process.exit(1)
    }
    yargsInstance.showHelp()
    process.exit(1)
  })

process.on('unhandledRejection', (error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})

cli.parse()
