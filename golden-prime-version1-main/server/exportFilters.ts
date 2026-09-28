export type ExportDateRange = { dateFrom?: string; dateTo?: string };

export function hasValidExportDateRange({ dateFrom, dateTo }: ExportDateRange) {
  return !(dateFrom && dateTo && dateFrom > dateTo);
}

export function isWithinInclusiveDateRange(value: string, { dateFrom, dateTo }: ExportDateRange) {
  return (!dateFrom || value >= dateFrom) && (!dateTo || value <= dateTo);
}

export function exportMonthBounds({ dateFrom, dateTo }: ExportDateRange) {
  return { fromMonth: dateFrom?.slice(0, 7), toMonth: dateTo?.slice(0, 7) };
}
