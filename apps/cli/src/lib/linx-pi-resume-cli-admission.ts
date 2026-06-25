import { selectLinxPiSession } from './linx-session-selector-ui.js'

export interface LinxResumeCliAdmissionArgs {
  cwd?: string
  resume?: boolean
  session?: string
  'session-dir'?: string
}

export interface LinxResumeCliAdmissionOptions<TArgs extends LinxResumeCliAdmissionArgs> {
  runWithSelectedSession(argv: TArgs): Promise<void>
}

export async function handleLinxResumeCliAdmission<TArgs extends LinxResumeCliAdmissionArgs>(
  argv: TArgs,
  options: LinxResumeCliAdmissionOptions<TArgs>,
): Promise<boolean> {
  if (!argv.resume) {
    return false
  }

  const selectedSession = await selectLinxPiSession(cwdFromArg(argv.cwd), argv['session-dir'])
  if (!selectedSession) {
    process.stdout.write('No session selected\n')
    return true
  }

  await options.runWithSelectedSession({
    ...argv,
    resume: false,
    session: selectedSession,
  })
  return true
}

function cwdFromArg(cwd: unknown): string {
  return typeof cwd === 'string' && cwd.trim() ? cwd : process.cwd()
}
