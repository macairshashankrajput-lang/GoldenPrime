import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("../client/src/pages/Settings.tsx", import.meta.url), "utf8");
const ownerSource = readFileSync(new URL("../client/src/pages/OwnerOverview.tsx", import.meta.url), "utf8");
const tenantSource = readFileSync(new URL("../client/src/pages/TenantPortal.tsx", import.meta.url), "utf8");
const managerLayoutSource = readFileSync(new URL("../client/src/components/DashboardLayout.tsx", import.meta.url), "utf8");
const motionPanelSource = readFileSync(new URL("../client/src/components/MotionPreferencePanel.tsx", import.meta.url), "utf8");
const billingSource = readFileSync(new URL("../client/src/pages/Billing.tsx", import.meta.url), "utf8");
const exportsSource = readFileSync(new URL("../client/src/pages/Exports.tsx", import.meta.url), "utf8");
const motionContextSource = readFileSync(new URL("../client/src/contexts/MotionContext.tsx", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../client/src/index.css", import.meta.url), "utf8");

describe("motion intensity preferences", () => {
  it("persists only supported preferences and applies the choice to the document root", () => {
    expect(motionContextSource).toContain('MOTION_INTENSITY_STORAGE_KEY = "golden-prime-motion-intensity"');
    expect(motionContextSource).toContain('motionIntensityOptions = ["system", "minimal", "standard"]');
    expect(motionContextSource).toContain('return isMotionIntensity(stored) ? stored : "system"');
    expect(motionContextSource).toContain("document.documentElement.dataset.motionIntensity = motionIntensity");
    expect(motionContextSource).toContain("localStorage.setItem(MOTION_INTENSITY_STORAGE_KEY, motionIntensity)");
  });

  it("mounts the preference provider globally and exposes reusable accessible motion controls", () => {
    expect(appSource).toContain("<MotionProvider>");
    expect(appSource).toContain("</MotionProvider>");
    expect(motionPanelSource).toContain("Motion and accessibility");
    expect(motionPanelSource).toContain('role="radiogroup" aria-label="Motion intensity"');
    expect(motionPanelSource).toContain('role="radio" aria-checked={selected}');
    expect(motionPanelSource).toContain("setMotionIntensity(option.value)");
    expect(settingsSource).toContain("<MotionPreferencePanel />");
    expect(ownerSource).toContain("Owner motion preference");
    expect(tenantSource).toContain("Resident motion preference");
  });

  it("persists Manager data density and applies compact hooks only to Manager workspace content", () => {
    expect(motionContextSource).toContain('DISPLAY_DENSITY_STORAGE_KEY = "golden-prime-display-density"');
    expect(motionContextSource).toContain('displayDensityOptions = ["comfortable", "compact"]');
    expect(motionContextSource).toContain("document.documentElement.dataset.displayDensity = displayDensity");
    expect(settingsSource).toContain("Manager data density");
    expect(settingsSource).toContain('role="radiogroup" aria-label="Manager data density"');
    expect(settingsSource).toContain("setDisplayDensity(option.value)");
    expect(managerLayoutSource).toContain("manager-density-${displayDensity}");
    expect(stylesSource).toContain(".manager-density-compact .manager-table-cell");
  });

  it("directly compacts Billing and Export financial record surfaces when Manager density is compact", () => {
    expect(billingSource).toContain("const { displayDensity } = useMotionPreferences()");
    expect(billingSource).toContain("billing-financial-view billing-density-${displayDensity}");
    expect(exportsSource).toContain("const { displayDensity } = useMotionPreferences()");
    expect(exportsSource).toContain("export-financial-view export-density-${displayDensity}");
    expect(exportsSource).toContain("export-summary-grid");
    expect(exportsSource).toContain("export-dataset-grid");
    expect(stylesSource).toContain(".manager-density-compact .billing-financial-view > section");
    expect(stylesSource).toContain(".manager-density-compact .export-financial-view .export-dataset-card");
  });

  it("keeps device reduced-motion support and disables decorative motion for minimal preference", () => {
    expect(stylesSource).toContain("@media (prefers-reduced-motion: reduce)");
    expect(stylesSource).toContain(':root[data-motion-intensity="minimal"] .app-page-transition');
    expect(stylesSource).toContain(':root[data-motion-intensity="minimal"] .motion-stagger > *');
    expect(stylesSource).toContain(':root[data-motion-intensity="minimal"] .interactive-surface:hover');
  });
});
