export const RESERVED_NON_TOP_LEVEL_COMMANDS = new Set([
  'automode',
  'chat',
  'footer',
  'fork',
  'help',
  'model',
  'new',
  'pi',
  'pi-frontend',
  'resume',
  'session',
  'sessions',
  'status-line',
  'statusline',
  'watch',
])

export interface LinxTopLevelCommandAdmissionArgs {
  print?: boolean
  backend?: unknown
  prompt?: string[]
}

export interface LinxTopLevelCommandAdmissionOptions {
  rejectReservedPromptCommands?: boolean
}

export function assertDefaultStartupPromptTokenIsAllowed(
  argv: LinxTopLevelCommandAdmissionArgs,
  options: LinxTopLevelCommandAdmissionOptions = {},
): void {
  if (!options.rejectReservedPromptCommands || argv.print || argv.backend) {
    return
  }

  const firstPromptToken = Array.isArray(argv.prompt) ? argv.prompt[0] : undefined
  if (firstPromptToken && RESERVED_NON_TOP_LEVEL_COMMANDS.has(firstPromptToken)) {
    throw new Error(`Unknown command: ${firstPromptToken}`)
  }
}
