import { isAutoModeRequest, runAutoModeCommand, type AutoModeCommandArgs } from './auto-mode-command.js'

export interface LinxAutoModeCliAdmissionArgs extends AutoModeCommandArgs {
  print?: boolean
}

export interface LinxAutoModeCliAdmissionOptions {
  includeBackend?: boolean
}

export async function handleLinxAutoModeCliAdmission(
  argv: LinxAutoModeCliAdmissionArgs,
  options: LinxAutoModeCliAdmissionOptions = {},
): Promise<boolean> {
  if (isAutoModeRequest(argv)) {
    await runAutoModeCommand(argv)
    return true
  }

  if (options.includeBackend && argv.backend) {
    await runAutoModeCommand({
      ...argv,
      plain: Boolean(argv.plain || argv.print),
    })
    return true
  }

  return false
}
