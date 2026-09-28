import { BedDouble, DoorOpen, Filter, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { BuildingEmptyState, LoadingState } from "@/components/AppStates";
import { PageHeader } from "@/components/PageHeader";
import { useActiveBuilding } from "@/hooks/useActiveBuilding";

const labels = { single: "Single", double: "Double sharing", triple: "Triple sharing", four: "Four sharing", individual: "Individual room", coliving: "Co-living" } as const;

export default function Vacancies() {
  const { buildingsQuery, building, buildingId, setBuildingId, snapshotQuery: snapshot } = useActiveBuilding();
  const [, setLocation] = useLocation();
  const [type, setType] = useState<"all" | keyof typeof labels>("all");
  const rows = useMemo(() => {
    if (!snapshot.data) return [];
    const occupied = new Map<number, number>();
    snapshot.data.allocations.filter(allocation => allocation.status === "active").forEach(allocation => occupied.set(allocation.roomId, (occupied.get(allocation.roomId) ?? 0) + 1));
    return snapshot.data.rooms.map(room => ({ room, occupied: occupied.get(room.id) ?? 0, available: Math.max(room.capacity - (occupied.get(room.id) ?? 0), 0) })).filter(row => row.available > 0 && (type === "all" || row.room.roomType === type));
  }, [snapshot.data, type]);
  if (buildingsQuery.isLoading || snapshot.isLoading) return <LoadingState />;
  if (!building || !buildingId || !snapshot.data) return <BuildingEmptyState />;
  return <div className="pb-8"><PageHeader eyebrow="Manager availability" title="Vacant rooms" description="Find open rooms and beds without mixing availability with tenant records or billing actions." buildings={buildingsQuery.data} buildingId={buildingId} onBuildingChange={setBuildingId} />
    <section className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border/70 bg-card p-4"><label className="flex items-center gap-2 text-sm font-medium"><Filter className="h-4 w-4 text-primary" /><span>Room type</span><select value={type} onChange={event => setType(event.target.value as typeof type)} className="h-10 rounded-xl border border-border bg-background px-3 text-sm"><option value="all">All available rooms</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className="rounded-2xl bg-primary/[0.05] px-4 py-3 text-sm"><p className="font-semibold">{rows.reduce((total, row) => total + row.available, 0)} beds available</p><p className="mt-0.5 text-xs text-muted-foreground">Across {rows.length} room{rows.length === 1 ? "" : "s"}</p></div></section>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{rows.length === 0 ? <div className="sm:col-span-2 xl:col-span-3 rounded-3xl border border-dashed border-border bg-muted/30 p-10 text-center"><DoorOpen className="mx-auto h-6 w-6 text-primary" /><p className="mt-3 font-semibold">No vacancy matches this view</p><p className="mt-1 text-sm text-muted-foreground">Change the room-type filter or review occupied rooms.</p></div> : rows.map(({ room, occupied, available }) => <article key={room.id} className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-[0_10px_28px_rgba(23,43,77,0.05)]">{room.imageUrl ? <img src={room.imageUrl} alt={`Room ${room.number}`} className="h-28 w-full object-cover" /> : <div className="grid h-24 place-items-center bg-primary/[0.04]"><DoorOpen className="h-6 w-6 text-primary" /></div>}<div className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-base font-semibold">Room {room.number}</p><p className="mt-1 text-sm text-muted-foreground">{labels[room.roomType]} · {room.balcony === "balcony" ? "Balcony" : "Non-balcony"}</p></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Open</span></div><div className="mt-5 rounded-2xl bg-primary/[0.04] p-3"><p className="flex items-center gap-1.5 text-xs font-semibold"><BedDouble className="h-3.5 w-3.5 text-primary" />{occupied}/{room.capacity} filled · {available} available</p><p className="mt-1 text-xs text-muted-foreground">{room.billingMode === "primary_payer" ? "Primary-payer Co-living billing" : room.billingMode === "manager_set" ? "Manager-set individual billing" : "Equal shared-bill allocation"}</p></div><button type="button" onClick={() => setLocation(`/rooms?allocate=${room.id}`)} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground"><UserPlus className="h-4 w-4" />Allocate tenant</button></div></article>)}</section>
  </div>;
}
