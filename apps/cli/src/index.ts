#!/usr/bin/env node
import './lib/node-warning-filter.js'
import { installLinxCliUnhandledRejectionHandler, runLinxCli } from './linx-cli-app.js'

installLinxCliUnhandledRejectionHandler()
runLinxCli(process.argv)
