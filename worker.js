// Rechnet in einem eigenen Thread, damit die Oberflaeche waehrend der
// Generierung bedienbar bleibt.
import { WebWorkerMLCEngineHandler } from "./vendor/web-llm.js";

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg) => handler.onmessage(msg);
