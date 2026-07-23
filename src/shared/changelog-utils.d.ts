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
export interface AppUpdateNotesInfo {
  updateNotesRange: string;
  updateNotes: ChangelogNote[];
  updateNotesSource: string;
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
): ReleaseAsset | null;
export function getChangelogDownloadUrl(
  release?: ReleaseLike | null,
): string;
export function fetchChangelogMarkdown(
  downloadUrl: string,
  fetchImpl?: typeof fetch,
): Promise<string>;
export function parseChangelogMarkdown(markdown: string): ChangelogParseResult;
export function formatUpdateNotesInfo(
  parsed: ChangelogParseResult,
  source: string,
): AppUpdateNotesInfo;
