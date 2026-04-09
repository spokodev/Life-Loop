export const correlationIdHeader = 'x-correlation-id'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogContext {
  correlationId?: string
  [key: string]: unknown
}

export interface Logger {
  debug: (message: string, context?: LogContext) => void
  info: (message: string, context?: LogContext) => void
  warn: (message: string, context?: LogContext) => void
  error: (message: string, context?: LogContext) => void
}

const levelPriority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

export function createLogger(service: string, level: LogLevel): Logger {
  const currentPriority = levelPriority[level]

  return {
    debug: (message, context) => writeLog('debug', currentPriority, service, message, context),
    info: (message, context) => writeLog('info', currentPriority, service, message, context),
    warn: (message, context) => writeLog('warn', currentPriority, service, message, context),
    error: (message, context) => writeLog('error', currentPriority, service, message, context),
  }
}

function writeLog(
  level: LogLevel,
  currentPriority: number,
  service: string,
  message: string,
  context?: LogContext,
) {
  if (levelPriority[level] < currentPriority) {
    return
  }

  const payload = {
    level,
    service,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  }

  const serialized = JSON.stringify(payload)

  if (level === 'error') {
    console.error(serialized)
    return
  }

  console.log(serialized)
}
