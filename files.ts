import { readFile, stat } from "node:fs/promises";
import { resolve, relative, basename, extname } from "node:path";
import fg from "fast-glob";

/** File metadata and content available for template substitution */
export interface FileInfo {
  /** Absolute filesystem path */
  absolute: string;
  /** Path relative to the document being processed */
  relative: string;
  /** Filename with extension */
  name: string;
  /** File extension (without leading dot) */
  extension: string;
  /** File content (frontmatter stripped if present) */
  content: string;
  /** Raw file content including frontmatter */
  rawContent: string;
  /** YAML frontmatter fields (if present) */
  metadata: Record<string, unknown>;
  /** Modification time (used as "created" on Linux where birthtime is unreliable) */
  mtime: Date;
  /** Access time */
  atime: Date;
  /** 0-based index in the sorted/filtered query result */
  queryIndex: number;
  /** 0-based index in the final processing order */
  processingIndex: number;
}

/** Options mirroring Target.Attributes */
export interface ResolveOptions {
  sort?: string;
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
  processing?: string;
  nameMatch?: string;
  pathMatch?: string;
  contentMatch?: string;
}

/**
 * Resolve, filter, sort, and slice files described by a glob pattern.
 *
 * @param pattern  Path or glob pattern (as written in `data-src`)
 * @param baseDir  Directory of the document being processed
 */
export async function resolveFiles(
  pattern: string,
  baseDir: string,
  options: ResolveOptions = {},
): Promise<FileInfo[]> {
  const {
    sort = "path",
    order = "asc",
    limit,
    offset,
    processing = "fifo",
    nameMatch,
    pathMatch,
    contentMatch,
  } = options;

  // Resolve glob relative to base directory
  const absolutePaths = await fg(pattern, {
    cwd: baseDir,
    absolute: true,
    onlyFiles: true,
  });

  // Read stats and content for each file
  const infoList = await Promise.all(
    absolutePaths.map(async (absPath, i): Promise<FileInfo | null> => {
      try {
        const fileStat = await stat(absPath);
        const rawContent = await readFile(absPath, "utf-8");
        const { content, metadata } = parseFrontmatter(rawContent);
        const relPath = relative(baseDir, absPath);
        const name = basename(absPath);
        const ext = extname(name).slice(1); // remove leading dot

        const info: FileInfo = {
          absolute: absPath,
          relative: relPath,
          name,
          extension: ext,
          content,
          rawContent,
          metadata,
          mtime: fileStat.mtime,
          atime: fileStat.atime,
          queryIndex: i,
          processingIndex: i,
        };
        return info;
      } catch {
        return null;
      }
    }),
  );

  let files = infoList.filter((f): f is FileInfo => f !== null);

  // --- Apply match filters ---
  if (nameMatch) {
    const re = toRegex(nameMatch);
    if (re) files = files.filter((f) => re.test(f.name));
  }
  if (pathMatch) {
    const re = toRegex(pathMatch);
    if (re) files = files.filter((f) => re.test(f.absolute));
  }
  if (contentMatch) {
    const re = toRegex(contentMatch);
    if (re) files = files.filter((f) => re.test(f.rawContent));
  }

  // --- Update query indices after filtering ---
  files.forEach((f, i) => {
    f.queryIndex = i;
  });

  // --- Sort ---
  files = sortFiles(files, sort, order);

  // --- Offset + limit ---
  const start = offset ?? 0;
  files = files.slice(start, limit !== undefined ? start + limit : undefined);

  // --- Processing order ---
  if (processing === "filo") {
    files = files.slice().reverse();
  }

  // --- Update processing indices ---
  files.forEach((f, i) => {
    f.processingIndex = i;
  });

  return files;
}

function sortFiles(
  files: FileInfo[],
  sortBy: string,
  order: "asc" | "desc",
): FileInfo[] {
  const dir = order === "asc" ? 1 : -1;

  return [...files].sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case "created":
      case "modified":
        cmp = a.mtime.getTime() - b.mtime.getTime();
        break;
      case "accessed":
        cmp = a.atime.getTime() - b.atime.getTime();
        break;
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "extension":
        cmp = a.extension.localeCompare(b.extension);
        break;
      case "path":
      default:
        cmp = a.relative.localeCompare(b.relative);
        break;
    }
    return cmp * dir;
  });
}

/**
 * Parse optional YAML frontmatter from file content.
 * Handles simple `key: value` pairs only.
 */
export function parseFrontmatter(raw: string): {
  content: string;
  metadata: Record<string, unknown>;
} {
  const frontmatterRe = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
  const match = frontmatterRe.exec(raw);
  if (!match) return { content: raw, metadata: {} };

  const yamlBlock = match[1];
  const content = raw.slice(match[0].length);
  const metadata: Record<string, unknown> = {};

  for (const line of yamlBlock.split(/\r?\n/)) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1).trim();
    // Simple type coercion
    if (val === "true") metadata[key] = true;
    else if (val === "false") metadata[key] = false;
    else if (/^-?\d+(\.\d+)?$/.test(val)) metadata[key] = Number(val);
    else metadata[key] = val.replace(/^['"]|['"]$/g, "");
  }

  return { content, metadata };
}

function toRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}
