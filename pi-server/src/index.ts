import { createApp } from "./app.js";
import { createRuntime } from "./runtime.js";

const runtime = createRuntime();
const app = createApp(runtime);

app.listen(runtime.config.port, runtime.config.host, () => {
  console.log(
    `Gullak pi-server listening on http://${runtime.config.host}:${runtime.config.port}`,
  );
});
