"use strict";

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

const currentLevel = LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LEVELS.info;

function formatLine(level, message, meta) {
  const ts    = new Date().toISOString();
  const badge = level.toUpperCase().padEnd(5);
  const base  = `[${ts}] ${badge} ${message}`;
  if (meta && typeof meta === "object") {
    return `${base}\n${JSON.stringify(meta, null, 2)}`;
  }
  return base;
}

function log(level, message, meta) {
  if (LEVELS[level] < currentLevel) return;

  const line = formatLine(level, message, meta);

  switch (level) {
    case "error": console.error(line); break;
    case "warn":  console.warn(line);  break;
    default:      console.log(line);   break;
  }
}

const logger = {
  debug : (msg, meta) => log("debug", msg, meta),
  info  : (msg, meta) => log("info",  msg, meta),
  warn  : (msg, meta) => log("warn",  msg, meta),
  error : (msg, meta) => log("error", msg, meta),
};

module.exports = logger;
