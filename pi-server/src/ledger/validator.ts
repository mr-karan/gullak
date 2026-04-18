import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export class LedgerValidator {
  private availability?: Promise<boolean>;

  constructor(
    private readonly cliPath: string,
    private readonly enabled: boolean,
  ) {}

  async isCliAvailable(): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    if (!this.availability) {
      this.availability = this.run(["--version"]).then((result) => result.code === 0);
    }

    return this.availability;
  }

  async validateContent(content: string): Promise<ValidationResult> {
    if (!this.enabled) {
      return { valid: true };
    }

    if (!(await this.isCliAvailable())) {
      return { valid: true };
    }

    const dir = await mkdtemp(join(tmpdir(), "gullak-ledger-"));
    const filePath = join(dir, "validate.ledger");

    try {
      await writeFile(filePath, content, "utf8");
      const result = await this.run(["-f", filePath, "source"]);
      return result.code === 0
        ? { valid: true }
        : { valid: false, error: result.stderr || result.stdout || "ledger validation failed" };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private async run(
    args: string[],
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const child = spawn(this.cliPath, args, { stdio: ["ignore", "pipe", "pipe"] });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });

      child.on("error", (error) => {
        resolve({ code: 1, stdout, stderr: error.message });
      });

      child.on("close", (code) => {
        resolve({ code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() });
      });
    });
  }
}
