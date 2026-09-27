import { WorkspaceFile } from "../types";

export interface ParsedCodeBlock {
  language: string;
  filePath: string;
  content: string;
}

/**
 * Extracts markdown code blocks matching ```lang file="path/to/file.ext" or similar formats
 */
export function extractCodeBlocksFromMessage(markdown: string): ParsedCodeBlock[] {
  const results: ParsedCodeBlock[] = [];

  // Match: ```language file="path" ... ``` or ```language:path ... ``` or ```language filepath="path"
  const regex = /```([a-zA-Z0-9_-]+)?(?:\s+(?:file|filepath|path)=["']?([^"'\s\n]+)["']?|:([^\s\n]+))?\n([\s\S]*?)```/g;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(markdown)) !== null) {
    const language = (match[1] || "text").toLowerCase();
    let explicitPath = match[2] || match[3] || "";
    let content = match[4] || "";

    // If explicit path not on the backticks line, check if the first line is a comment with file path
    if (!explicitPath) {
      const firstLineMatch = content.match(/^(?:\/\/|#|\/\*|<!--)\s*(?:file(?:path)?:\s*|src\/|lib\/|[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+)([^\n*-->]+)(?:\*\/|-->)?/i);
      if (firstLineMatch) {
        const potentialPath = firstLineMatch[0]
          .replace(/^(?:\/\/|#|\/\*|<!--)\s*(?:file(?:path)?:\s*)?/i, "")
          .replace(/(?:\*\/|-->)$/, "")
          .trim();
        if (potentialPath && (potentialPath.includes(".") || potentialPath.includes("/"))) {
          explicitPath = potentialPath;
        }
      }
    }

    if (explicitPath) {
      results.push({
        language,
        filePath: explicitPath.trim(),
        content: content.trimEnd(),
      });
    }
  }

  return results;
}

/**
 * Merges newly extracted code blocks into current workspace files
 */
export function mergeExtractedFiles(
  currentFiles: WorkspaceFile[],
  extractedBlocks: ParsedCodeBlock[]
): { updatedFiles: WorkspaceFile[]; createdCount: number; updatedCount: number } {
  const map = new Map<string, WorkspaceFile>();
  currentFiles.forEach((f) => map.set(f.path, f));

  let createdCount = 0;
  let updatedCount = 0;

  for (const block of extractedBlocks) {
    const existing = map.get(block.filePath);
    if (existing) {
      if (existing.content !== block.content) {
        map.set(block.filePath, {
          ...existing,
          content: block.content,
          language: block.language || existing.language,
          size: block.content.length,
          modified: true,
        });
        updatedCount++;
      }
    } else {
      const fileName = block.filePath.split("/").pop() || block.filePath;
      map.set(block.filePath, {
        id: "file-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
        name: fileName,
        path: block.filePath,
        content: block.content,
        language: block.language || fileName.split(".").pop() || "txt",
        size: block.content.length,
        modified: true,
      });
      createdCount++;
    }
  }

  return {
    updatedFiles: Array.from(map.values()),
    createdCount,
    updatedCount,
  };
}
