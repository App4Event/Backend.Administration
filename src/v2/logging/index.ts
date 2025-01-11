const moduleLoggingEnabled = (module: string) =>
  process.env.DEBUG?.includes(module) ?? false

type Log = (message: string, structured: any) => void

interface Logger {
  info: Log
  error: Log
  warning: Log
}

const googleCloudLog = (
  severity: 'INFO' | 'ERROR' | 'WARNING',
  message: string,
  structured: any
) => {
  process.stderr.write(
    JSON.stringify({
      message,
      severity,
      ...structured,
    })
  )
}

const createModuleLogger = (module: string): Logger => {
  if (!moduleLoggingEnabled(module)) {
    return {
      info: () => {},
      error: () => {},
      warning: () => {},
    }
  }
  return {
    info: googleCloudLog.bind(null, 'INFO'),
    error: googleCloudLog.bind(null, 'ERROR'),
    warning: googleCloudLog.bind(null, 'WARNING'),
  }
}

export const logging = {
  createModuleLogger,
}
