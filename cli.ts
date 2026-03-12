#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parkdown } from "./parkdown.js";

const USAGE = `\
parkdown - Programmatic Markdown inclusions

Usage:
  parkdown [options] <file.md>

Options:
  --raw           Inject rendered content inside the source HTML tags (default)
  --clean         Strip all parkdown HTML tags; output rendered content only
  -o, --output    Write output to a file instead of stdout
  --in-place      Rewrite the source file with the processed output
  -h, --help      Show this help message

Examples:
  parkdown cases/chat-history/full/given.md
  parkdown --clean cases/chat-history/full/given.md
  parkdown --raw cases/chat-history/full/given.md -o out.md
  parkdown --in-place cases/chat-history/full/given.md
`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("-h") || args.includes("--help") || args.length === 0) {
    process.stdout.write(USAGE);
    process.exit(0);
  }

  let mode: "raw" | "clean" = "raw";
  let outputPath: string | undefined;
  let inPlace = false;
  let inputPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--clean") {
      mode = "clean";
    } else if (arg === "--raw") {
      mode = "raw";
    } else if (arg === "--in-place") {
      inPlace = true;
    } else if (arg === "-o" || arg === "--output") {
      outputPath = args[++i];
    } else if (!arg.startsWith("-")) {
      inputPath = arg;
    } else {
      process.stderr.write(`Unknown option: ${arg}\n`);
      process.exit(1);
    }
  }

  if (!inputPath) {
    process.stderr.write("Error: no input file specified\n");
    process.stderr.write(USAGE);
    process.exit(1);
  }

  const absInput = resolve(inputPath);

  let result: string;
  try {
    result = await parkdown(absInput, { mode });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error processing ${inputPath}: ${msg}\n`);
    process.exit(1);
  }

  if (inPlace) {
    await writeFile(absInput, result, "utf-8");
  } else if (outputPath) {
    await writeFile(resolve(outputPath), result, "utf-8");
  } else {
    process.stdout.write(result);
  }
}

main().catch((err) => {
  process.stderr.write(
    `Fatal: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
