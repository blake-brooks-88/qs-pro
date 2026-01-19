export function buildQppResultsDataExtensionName(
  runId: string,
  snippetName?: string | null,
): string {
  const hash = runId.slice(0, 8);
  const normalizedSnippetName = snippetName?.trim();

  if (normalizedSnippetName) {
    return `QPP_${normalizedSnippetName.replace(/\s+/g, "_")}_${hash}`;
  }

  return `QPP_Results_${hash}`;
}
