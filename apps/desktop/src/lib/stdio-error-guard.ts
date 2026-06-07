const BROKEN_STDIO_ERROR_CODES = new Set(['EIO', 'EPIPE', 'EBADF']);
const INSTALL_KEY = Symbol.for('linx.desktop.stdioErrorGuardInstalled');

type GlobalWithGuardFlag = typeof globalThis & {
  [INSTALL_KEY]?: boolean;
};

function getErrorCode(error: unknown): string | undefined {
  if (!(error instanceof Error) || !('code' in error)) {
    return undefined;
  }

  const code = (error as NodeJS.ErrnoException).code;
  return typeof code === 'string' ? code : undefined;
}

export function isBrokenStdIoError(error: unknown): boolean {
  const code = getErrorCode(error);
  return Boolean(code && BROKEN_STDIO_ERROR_CODES.has(code));
}

function installStreamErrorGuard(stream: NodeJS.WriteStream | undefined): void {
  stream?.on?.('error', (error) => {
    if (!isBrokenStdIoError(error)) {
      throw error;
    }
  });
}

function wrapConsoleMethod(methodName: 'debug' | 'error' | 'info' | 'log' | 'warn'): void {
  const original = console[methodName].bind(console);
  console[methodName] = (...args: unknown[]) => {
    try {
      original(...args);
    } catch (error) {
      if (!isBrokenStdIoError(error)) {
        throw error;
      }
    }
  };
}

export function installStdIoErrorGuard(): void {
  const globalWithFlag = globalThis as GlobalWithGuardFlag;
  if (globalWithFlag[INSTALL_KEY]) {
    return;
  }

  globalWithFlag[INSTALL_KEY] = true;
  installStreamErrorGuard(process.stdout);
  installStreamErrorGuard(process.stderr);
  wrapConsoleMethod('debug');
  wrapConsoleMethod('error');
  wrapConsoleMethod('info');
  wrapConsoleMethod('log');
  wrapConsoleMethod('warn');
}

installStdIoErrorGuard();
