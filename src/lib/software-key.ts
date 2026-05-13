export function buildKey(name: string, version: string): string
export function buildKey(entry: { name: string; version: string }): string
export function buildKey(
  nameOrEntry: string | { name: string; version: string },
  version?: string,
): string {
  if (typeof nameOrEntry === 'string') {
    return `${nameOrEntry}|${version}`
  }
  return `${nameOrEntry.name}|${nameOrEntry.version}`
}
