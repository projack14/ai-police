// Sentry initialization for React (Vite + TypeScript)
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "https://7399fa0103e56d6981841c6a332c7043@o4510700559204352.ingest.us.sentry.io/4510700560515072",
  // Setting this option to true will send default PII data to Sentry.
  // For example, automatic IP address collection on events
  sendDefaultPii: true
});
