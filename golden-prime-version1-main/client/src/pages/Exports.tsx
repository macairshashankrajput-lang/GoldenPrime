import * as XLSX from "xlsx";
import { Check, Database, Download, FileSpreadsheet, Filter, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BuildingEmptyState, LoadingState } from "@/components/AppStates";
import { PageHeader, PrimaryAction } from "@/components/PageHeader";
import { useActiveBuilding } from "@/hooks/useActiveBuilding";
import { useMotionPreferences } from "@/contexts/MotionContext";
import { trpc } from "@/lib/trpc";

const fieldClass = "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10";
const datasets = [
  { id: "building", label: "Building profile", description: "Address, electricity rate, and Owner cut" },
  { id: "rooms", label: "Rooms", description: "Capacity, type, floor, and default rent" },
  { id: "tenants", label: "Tenants", description: "Profiles, active room, and agreed rent" },
  { id: "allocations", label: "Room allocations", description: "Move-ins, beds, deposits, and history" },
  { id: "rent", label: "Rent", description: "Monthly billed, paid, balance, and status" },
  { id: "electricity", label: "Electricity", description: "Meter readings, bills, payments, and balances" },
  { id: "tenantCharges", label: "Tenant charges", description: "Services, shared costs, and assigned costs" },
  { id: "expenses", label: "Expenses", description: "General building expense ledger" },
  { id: "operatingCosts", label: "Operating costs", description: "Staff, supplies, maintenance, and payable balance" },
  { id: "services", label: "Services", description: "Building and tenant service configurations" },
  { id: "reminders", label: "Reminders", description: "Rent follow-ups and delivery state" },
  { id: "transfers", label: "Tenant transfers", description: "Room changes and proration history" },
  { id: "ownerSettlements", label: "Owner settlements", description: "Owner payment amount, status, and proof state" },
  { id: "buildingElectricity", label: "Building electricity", description: "Total utility bills and payment balances" },
  { id: "managerAdjustments", label: "Manager-result adjustments", description: "Separate operational-result adjustments" },
  { id: "accounts", label: "Account roster", description: "Authorized role and login phone; never passwords" },
  { id: "notifications", label: "Manager notifications", description: "Collection alerts and read state" },
  { id: "auditLogs", label: "Audit history", description: "Building change and recovery events without snapshots" },
  { id: "exportHistory", label: "Export history", description: "Prior export request timestamps and filters" },
] as const;

type DatasetId = (typeof datasets)[number]["id"];
type ExportSheet = { name: string; rows: Record<string, string | number | boolean | null>[] };

function createWorkbook(sheets: ExportSheet[], fileName: string) {
  const workbook = XLSX.utils.book_new();
  sheets.forEach(({ name, rows }) => {
    const headers = Array.from(new Set(rows.flatMap(row => Object.keys(row))));
    const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
    worksheet["!cols"] = headers.map(header => ({ wch: Math.min(Math.max(header.length + 3, ...rows.map(row => String(row[header] ?? "").length + 2)), 42) }));
    worksheet["!autofilter"] = { ref: worksheet["!ref"] ?? "A1" };
    const range = worksheet["!ref"] ? XLSX.utils.decode_range(worksheet["!ref"]) : null;
    if (range) for (let column = range.s.c; column <= range.e.c; column += 1) {
      const header = headers[column] ?? "";
      if (!header.includes("(₹)")) continue;
      for (let row = range.s.r + 1; row <= range.e.r; row += 1) {
        const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: column })];
        if (cell && typeof cell.v === "number") cell.z = '[$₹-en-IN]#,##0.00';
      }
    }
    XLSX.utils.book_append_sheet(workbook, worksheet, name);
  });
  XLSX.writeFile(workbook, fileName, { compression: true });
}

function escapeCsvCell(value: string | number | boolean | null) {
  const text = String(value ?? "");
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safeText) ? `"${safeText.replace(/"/g, '""')}"` : safeText;
}

function createCsv(rows: Record<string, string | number | boolean | null>[], fields: string[], fileName: string) {
  const lines = [fields, ...rows.map(row => fields.map(field => row[field] ?? null))].map(values => values.map(escapeCsvCell).join(","));
  const blob = new Blob([`\uFEFF${lines.join("\r\n")}\r\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function Exports() {
  const { buildingsQuery, building, buildingId, setBuildingId } = useActiveBuilding();
  const { displayDensity } = useMotionPreferences();
  const [mode, setMode] = useState<"selected" | "complete">("selected");
  const [selected, setSelected] = useState<DatasetId[]>(["building", "rooms", "tenants", "rent"]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<"all" | "paid" | "pending" | "partial">("all");
  const [outstandingOnly, setOutstandingOnly] = useState(false);
  const [fieldSelections, setFieldSelections] = useState<Record<string, string[]>>({});
  const selectedLabels = useMemo(() => new Set(selected), [selected]);
  const previewInput = useMemo(() => ({ buildingId: buildingId ?? 0, mode: "selected" as const, datasets: selected, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, paymentStatus, outstandingOnly }), [buildingId, dateFrom, dateTo, outstandingOnly, paymentStatus, selected]);
  const workbookPreview = trpc.pg.exports.previewWorkbook.useQuery(previewInput, { enabled: Boolean(buildingId) && mode === "selected" && selected.length > 0 });
  const prepareWorkbook = trpc.pg.exports.prepareWorkbook.useMutation({
    onSuccess: (data, variables) => {
      createWorkbook(data.sheets, `${data.buildingName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${variables.mode}-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success("Excel workbook downloaded");
    },
    onError: error => toast.error(error.message),
  });
  const prepareCsv = trpc.pg.exports.csv.useMutation({
    onSuccess: data => {
      createCsv(data.rows, data.fields, `${data.buildingName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${data.dataset}-export-${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success(`${data.dataset === "rooms" ? "Room" : "Tenant"} CSV downloaded`);
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (!workbookPreview.data) return;
    setFieldSelections(current => {
      const next = { ...current };
      workbookPreview.data.sheets.forEach(sheet => {
        if (sheet.fields.length === 0) return;
        const existing = current[sheet.dataset]?.filter(field => sheet.fields.includes(field));
        next[sheet.dataset] = existing && existing.length > 0 ? existing : sheet.fields;
      });
      return next;
    });
  }, [workbookPreview.data]);

  if (buildingsQuery.isLoading) return <LoadingState />;
  if (!building || !buildingId) return <BuildingEmptyState />;

  const toggleDataset = (dataset: DatasetId) => setSelected(current => current.includes(dataset) ? current.filter(item => item !== dataset) : [...current, dataset]);
  const toggleField = (dataset: string, field: string, availableFields: string[]) => {
    setFieldSelections(current => {
      const visible = current[dataset] ?? availableFields;
      if (visible.includes(field)) {
        if (visible.length === 1) return current;
        return { ...current, [dataset]: visible.filter(item => item !== field) };
      }
      return { ...current, [dataset]: [...visible, field] };
    });
  };
  const download = () => {
    if (mode === "selected" && selected.length === 0) return toast.error("Select at least one data section first.");
    const selectedFieldMap = Object.fromEntries(selected.flatMap(dataset => fieldSelections[dataset]?.length ? [[dataset, fieldSelections[dataset]]] : []));
    prepareWorkbook.mutate({ buildingId, mode, datasets: mode === "complete" ? [] : selected, dateFrom: mode === "selected" && dateFrom ? dateFrom : undefined, dateTo: mode === "selected" && dateTo ? dateTo : undefined, paymentStatus: mode === "selected" ? paymentStatus : "all", outstandingOnly: mode === "selected" && outstandingOnly, fieldSelections: mode === "selected" ? selectedFieldMap : undefined });
  };

  return <div className={`export-financial-view export-density-${displayDensity} pb-8`}>
    <PageHeader eyebrow="Manager reporting" title="Export & Filters" description="Build a formatted, building-scoped Excel workbook with exactly the operational entries you need." buildings={buildingsQuery.data} buildingId={buildingId} onBuildingChange={setBuildingId} />
    <section className="export-summary-grid mb-5 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]"><article className="rounded-3xl border border-primary/20 bg-primary/[0.04] p-5 shadow-[0_10px_28px_rgba(23,43,77,0.05)]"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><FileSpreadsheet className="h-5 w-5" /></span><div><h2 className="text-sm font-semibold">Formatted Excel, not a raw database dump</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Financial sheets include billed, paid, and remaining balance values in rupees. The selected building is enforced on every export.</p></div></div></article><article className="rounded-3xl border border-amber-200 bg-amber-50 p-5"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div><h2 className="text-sm font-semibold text-amber-950">Security boundary</h2><p className="mt-1 text-xs leading-5 text-amber-900">Password values, password hashes, database credentials, session data, and secrets are never included. The safe account roster only shows authorized role and login phone.</p></div></div></article></section>
    <section className="mb-5 rounded-3xl border border-border/70 bg-card p-5 shadow-[0_10px_28px_rgba(23,43,77,0.04)] sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold">Quick CSV downloads</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Download the current building’s sanitized room or tenant data for spreadsheets and local analysis. Active date filters apply to tenant records.</p></div><span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">Building scoped</span></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><button type="button" disabled={prepareCsv.isPending} onClick={() => prepareCsv.mutate({ buildingId, dataset: "rooms", dateFrom: dateFrom || undefined, dateTo: dateTo || undefined })} className="flex items-center justify-between rounded-2xl border border-border bg-background p-4 text-left transition hover:border-primary/40 disabled:cursor-wait disabled:opacity-60"><span><span className="block text-sm font-semibold">Rooms CSV</span><span className="mt-1 block text-xs text-muted-foreground">Floor, capacity, type, occupancy-ready room catalog</span></span><Download className="h-4 w-4 text-primary" /></button><button type="button" disabled={prepareCsv.isPending} onClick={() => prepareCsv.mutate({ buildingId, dataset: "tenants", dateFrom: dateFrom || undefined, dateTo: dateTo || undefined })} className="flex items-center justify-between rounded-2xl border border-border bg-background p-4 text-left transition hover:border-primary/40 disabled:cursor-wait disabled:opacity-60"><span><span className="block text-sm font-semibold">Tenants CSV</span><span className="mt-1 block text-xs text-muted-foreground">Tenant profile, active room, agreed rent, and move-in date</span></span><Download className="h-4 w-4 text-primary" /></button></div></section>
    <section className="export-scope-card overflow-hidden rounded-3xl border border-border/70 bg-card shadow-[0_10px_28px_rgba(23,43,77,0.05)]"><div className="border-b border-border px-5 py-4"><p className="text-sm font-semibold">Choose export scope</p><p className="mt-1 text-xs text-muted-foreground">All exports are restricted to <span className="font-semibold text-foreground">{building.name}</span>.</p></div><div className="p-5"><div className="grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => setMode("selected")} className={`rounded-2xl border p-4 text-left transition ${mode === "selected" ? "border-primary bg-primary/[0.05] ring-4 ring-primary/10" : "border-border hover:border-primary/35"}`}><div className="flex items-center justify-between gap-3"><span className="font-semibold">Selected data</span>{mode === "selected" ? <Check className="h-4 w-4 text-primary" /> : null}</div><p className="mt-1 text-xs leading-5 text-muted-foreground">Pick sections, filters, and visible workbook fields.</p></button><button type="button" onClick={() => setMode("complete")} className={`rounded-2xl border p-4 text-left transition ${mode === "complete" ? "border-primary bg-primary/[0.05] ring-4 ring-primary/10" : "border-border hover:border-primary/35"}`}><div className="flex items-center justify-between gap-3"><span className="font-semibold">Complete operational data</span>{mode === "complete" ? <Check className="h-4 w-4 text-primary" /> : null}</div><p className="mt-1 text-xs leading-5 text-muted-foreground">Export all current building operations into separate sheets, while excluding authentication secrets.</p></button></div>
      {mode === "selected" ? <><div className="mt-6 flex items-center gap-2"><Filter className="h-4 w-4 text-primary" /><div><h3 className="text-sm font-semibold">Filters</h3><p className="mt-1 text-xs text-muted-foreground">These filters apply consistently to selected financial sections and the preview below.</p></div></div><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="grid gap-1 text-sm font-medium">From date<input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} className={fieldClass} /></label><label className="grid gap-1 text-sm font-medium">To date<input type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} min={dateFrom || undefined} className={fieldClass} /></label><label className="grid gap-1 text-sm font-medium">Payment status<select value={paymentStatus} onChange={event => setPaymentStatus(event.target.value as typeof paymentStatus)} className={fieldClass}><option value="all">All statuses</option><option value="paid">Paid</option><option value="pending">Pending</option><option value="partial">Partial</option></select></label><label className="flex items-end gap-3 rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm font-medium"><input type="checkbox" checked={outstandingOnly} onChange={event => setOutstandingOnly(event.target.checked)} className="h-4 w-4 accent-primary" />Outstanding balances only</label></div><div className="mt-6 flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Data sections</h3><p className="mt-1 text-xs text-muted-foreground">{selected.length} section{selected.length === 1 ? "" : "s"} selected.</p></div><button type="button" onClick={() => setSelected(datasets.map(dataset => dataset.id))} className="text-xs font-semibold text-primary underline-offset-2 hover:underline">Select all</button></div><div className="export-dataset-grid mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{datasets.map(dataset => <button key={dataset.id} type="button" onClick={() => toggleDataset(dataset.id)} className={`export-dataset-card rounded-2xl border p-3 text-left transition ${selectedLabels.has(dataset.id) ? "border-primary bg-primary/[0.05]" : "border-border hover:border-primary/30"}`}><span className="flex items-start justify-between gap-3"><span><span className="block text-sm font-semibold">{dataset.label}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{dataset.description}</span></span>{selectedLabels.has(dataset.id) ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : null}</span></button>)}</div>
        <section className="mt-6 rounded-2xl border border-primary/20 bg-primary/[0.025] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">Export preview and visible fields</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Use the field controls to choose the columns included in each selected workbook sheet.</p></div>{workbookPreview.isFetching ? <span className="text-xs font-semibold text-primary">Refreshing preview…</span> : null}</div>{workbookPreview.isError ? <p className="mt-3 text-sm text-rose-700">{workbookPreview.error.message}</p> : null}{workbookPreview.data?.sheets.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No rows match the selected filters. Adjust filters to review available fields.</p> : <div className="mt-4 space-y-4">{workbookPreview.data?.sheets.map(sheet => { const visibleFields = sheet.fields.filter(field => (fieldSelections[sheet.dataset] ?? sheet.fields).includes(field)); return <article key={sheet.dataset} className="rounded-xl border border-border bg-card p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="text-sm font-semibold capitalize">{sheet.dataset}</h4><p className="mt-0.5 text-xs text-muted-foreground">{sheet.rowCount} matching row{sheet.rowCount === 1 ? "" : "s"} · {visibleFields.length} of {sheet.fields.length} fields visible</p></div>{sheet.fields.length > 0 ? <button type="button" onClick={() => setFieldSelections(current => ({ ...current, [sheet.dataset]: sheet.fields }))} className="text-xs font-semibold text-primary underline-offset-2 hover:underline">Show all fields</button> : null}</div>{sheet.fields.length === 0 ? <p className="mt-3 text-xs text-muted-foreground">No matching rows are available for this sheet with the active filters.</p> : <><div className="mt-3 flex flex-wrap gap-2">{sheet.fields.map(field => { const checked = visibleFields.includes(field); return <label key={field} className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${checked ? "border-primary/30 bg-primary/[0.05] text-primary" : "border-border bg-background text-muted-foreground"}`}><input type="checkbox" checked={checked} onChange={() => toggleField(sheet.dataset, field, sheet.fields)} className="h-3.5 w-3.5 accent-primary" />{field}</label>; })}</div><div className="mt-3 overflow-x-auto rounded-lg border border-border"><table className="min-w-full text-left text-xs"><thead className="bg-muted/50"><tr>{visibleFields.map(field => <th key={field} className="whitespace-nowrap px-2.5 py-2 font-semibold">{field}</th>)}</tr></thead><tbody>{sheet.sampleRows.map((row, index) => <tr key={index} className="border-t border-border/70">{visibleFields.map(field => <td key={field} className="max-w-48 truncate px-2.5 py-2 text-muted-foreground">{String(row[field] ?? "—")}</td>)}</tr>)}</tbody></table></div></>}</article>; })}</div>}</section></> : <div className="mt-6 rounded-2xl border border-primary/20 bg-primary/[0.035] p-4"><div className="flex items-start gap-3"><Database className="mt-0.5 h-5 w-5 text-primary" /><div><h3 className="text-sm font-semibold">Complete building operational workbook</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Includes building profile, rooms, tenants, allocations, rent, electricity, tenant charges, expenses, operating costs, services, reminders, transfers, settlements, utility bills, Manager-result adjustments, safe account roster, notifications, building audit history, and export history. It intentionally excludes every password, hash, token, session, and database secret.</p></div></div></div>}
      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-5"><PrimaryAction onClick={download}>{prepareWorkbook.isPending ? "Preparing workbook…" : <><Download className="mr-1.5 h-4 w-4" />Download Excel workbook</>}</PrimaryAction><span className="text-xs text-muted-foreground">{mode === "selected" ? "Selected sheets honor filters and visible fields above." : "Complete export includes all operational records for this building."}</span></div></div></section>
  </div>;
}
