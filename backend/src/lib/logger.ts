import pino, { Logger } from 'pino';
import fs from 'fs';
import path from 'path';

const isProduction = process.env.NODE_ENV === 'production';
const LOG_DIR = process.env.LOG_DIR || '/app/logs';

/**
 * Shared pino logger instance.
 *
 * - Production: JSON to stdout (Docker) + JSON to /app/logs/app.log (persistent)
 * - Development: pretty-printed via pino-pretty (stdout only)
 *
 * LOG_LEVEL env var overrides the default level (info).
 * Sensitive headers are automatically redacted.
 */

function createLogger(): Logger {
  const baseOptions: pino.LoggerOptions = {
    level: process.env.LOG_LEVEL || 'info',
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie'],
      censor: '[REDACTED]',
    },
  };

  if (!isProduction) {
    return pino({
      ...baseOptions,
      transport: { target: 'pino-pretty', options: { colorize: true } },
    });
  }

  // Production: write to both stdout and a persistent log file
  const streams: pino.StreamEntry[] = [
    { level: 'info', stream: process.stdout },
  ];

  // Only add file stream if the log directory exists or can be created
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const logFilePath = path.join(LOG_DIR, 'app.log');
    const fileStream = fs.createWriteStream(logFilePath, { flags: 'a' });
    streams.push({ level: 'info', stream: fileStream });
  } catch {
    // Log dir not writable (e.g. local dev without Docker volume) — skip file
    console.warn(`[logger] Could not open log file in ${LOG_DIR}, writing to stdout only`);
  }

  return pino(baseOptions, pino.multistream(streams));
}

const logger: Logger = createLogger();

export default logger;
