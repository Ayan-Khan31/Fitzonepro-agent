"use strict";

require("dotenv").config();

const express = require("express");
const webhookRouter = require("./webhook");
const { processFollowUps } = require("./followup");
const logger  = require("./logger");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
  logger.debug(`→ ${req.method} ${req.originalUrl}`);
  next();
});

app.use("/webhook", webhookRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", ts: new Date().toISOString() });
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, _req, res, _next) => {
  logger.error(`[Server] Unhandled error: ${err.message}`, { stack: err.stack });
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  logger.info(`🚀 FitZone Pro WhatsApp Agent running on port ${PORT}`);
  logger.info(`   Webhook URL: http://localhost:${PORT}/webhook`);
  logger.info(`   Health:      http://localhost:${PORT}/health`);
  processFollowUps();
});

module.exports = app;
