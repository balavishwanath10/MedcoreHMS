type LogLevel = 'info' | 'warn' | 'error' | 'debug';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'jwt',
  'secret',
  'otp',
  'authorization',
  'cookie',
  'ssn',
  'creditcard',
  'medicalhistory',
  'diagnosis',
]);

function redactSensitiveData(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveData(item));
  }

  const redactedObj: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      redactedObj[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      redactedObj[key] = redactSensitiveData(value);
    } else {
      redactedObj[key] = value;
    }
  }
  return redactedObj;
}

function formatLog(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(),
    message,
    ...(meta ? { meta: redactSensitiveData(meta) } : {}),
  };
  return JSON.stringify(logEntry);
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => {
    console.log(formatLog('info', message, meta));
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    console.warn(formatLog('warn', message, meta));
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    console.error(formatLog('error', message, meta));
  },
  debug: (message: string, meta?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(formatLog('debug', message, meta));
    }
  },
};
