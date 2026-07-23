export interface ChangelogNote {
  hash: string;
  shortHash: string;
  message: string;
  url?: string;
}

export interface ChangelogParseResult {
  range: string;
  notes: ChangelogNote[];
}

export interface ReleaseAsset {
  name?: string;
  url?: string;
  browser_download_url?: string;
}

export interface ReleaseLike {
  assets?: ReleaseAsset[];
}

export function selectChangelogAsset(
  release?: ReleaseLike | null,
): ReleaseAsset | null {
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  return (
    assets.find(
      (asset) =>
        asset?.name === "CHANGELOG.md" &&
        Boolean(asset.url || asset.browser_download_url),
    ) ?? null
  );
}

export function getChangelogDownloadUrl(
  release?: ReleaseLike | null,
): string {
  const asset = selectChangelogAsset(release);
  return asset?.browser_download_url || asset?.url || "";
}

export async function fetchChangelogMarkdown(
  downloadUrl: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<string> {
  if (!downloadUrl || typeof fetchImpl !== "function") return "";
  const response = await fetchImpl(downloadUrl, {
    headers: {
      Accept: "application/octet-stream",
      "User-Agent": "API-forge",
    },
  });
  if (!response?.ok) return "";
  return await response.text();
}

export function parseChangelogMarkdown(markdown: string): ChangelogParseResult {
  const lines = String(markdown ?? "").split(/\r?\n/);
  const sectionIndex = lines.findIndex((line) => /^##\s+/.test(line));
  const rangeMatch = String(markdown ?? "").match(/生成范围：`([^`]+)`/);
  const notes: ChangelogNote[] = [];

  const collectNotes = (targetLines: string[]) => {
    for (const rawLine of targetLines) {
      const line = rawLine.trim();
      const linkedMatch = line.match(
        /^- \[([0-9a-f]{7,40})\]\(([^)]+)\)\s+(.+)$/i,
      );
      const plainMatch = line.match(/^- ([0-9a-f]{7,40})\s+(.+)$/i);
      const hash = linkedMatch?.[1] ?? plainMatch?.[1];
      const url = linkedMatch?.[2];
      const message = linkedMatch?.[3] ?? plainMatch?.[2];
      if (!hash || !message) continue;

      notes.push({
        hash,
        shortHash: hash.slice(0, 7),
        message,
        url,
      });
    }
  };

  if (sectionIndex !== -1) {
    const sectionTitle = lines[sectionIndex].replace(/^##\s+/, "").trim();
    for (let index = sectionIndex + 1; index < lines.length; index += 1) {
      const line = lines[index].trim();
      if (line.startsWith("## ")) break;
      collectNotes([line]);
    }

    if (notes.length > 0) {
      return { range: rangeMatch?.[1] ?? sectionTitle, notes };
    }

    collectNotes(lines);
    return { range: rangeMatch?.[1] ?? sectionTitle, notes };
  }

  collectNotes(lines);
  return { range: rangeMatch?.[1] ?? "", notes };
}
