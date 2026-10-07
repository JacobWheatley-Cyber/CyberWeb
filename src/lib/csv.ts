export function csvCell(value: unknown): string {
  const text = String(value ?? '').replace(/[\r\n]+/g, ' ')
  // Spreadsheet programs may evaluate cells beginning with formula characters.
  const safe = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(',')
}
