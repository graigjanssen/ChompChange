export function getPeriodsInMonth(year: number, month: number): number {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  return daysInMonth * 2
}

export function getMonthStr(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-01`
}

export function getMonthLabel(year: number, month: number): string {
  return new Date(year, month).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}
