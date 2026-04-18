import { createRuntime } from "../runtime.js";

const runtime = createRuntime();
const sendWhatsapp = process.argv.includes("--send-whatsapp");
const force = process.argv.includes("--force");

const result = await runtime.weeklyRecapService.run({
  sendWhatsapp,
  force,
});

console.log(result.markdown);
