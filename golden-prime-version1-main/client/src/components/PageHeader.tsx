import { type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type BuildingOption = { id: number; name: string };

export function PageHeader({
  eyebrow,
  title,
  description,
  buildings,
  buildingId,
  onBuildingChange,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  buildings?: BuildingOption[];
  buildingId?: number | null;
  onBuildingChange?: (id: number) => void;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
        <h1 className="text-2xl font-semibold tracking-[-0.04em] text-foreground sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </header>
  );
}

export function PrimaryAction({ children, onClick, type = "button" }: { children: ReactNode; onClick?: () => void; type?: "button" | "submit" }) {
  return <Button type={type} onClick={onClick} className="h-10 rounded-xl px-4 font-semibold shadow-[0_8px_18px_rgba(15,118,110,0.18)]">{children}</Button>;
}
