import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export const MOTION_INTENSITY_STORAGE_KEY = "golden-prime-motion-intensity";
export const DISPLAY_DENSITY_STORAGE_KEY = "golden-prime-display-density";
export const motionIntensityOptions = ["system", "minimal", "standard"] as const;
export const displayDensityOptions = ["comfortable", "compact"] as const;
export type MotionIntensity = typeof motionIntensityOptions[number];
export type DisplayDensity = typeof displayDensityOptions[number];

type MotionContextValue = {
  motionIntensity: MotionIntensity;
  setMotionIntensity: (intensity: MotionIntensity) => void;
  displayDensity: DisplayDensity;
  setDisplayDensity: (density: DisplayDensity) => void;
};

const MotionContext = createContext<MotionContextValue | null>(null);

function isMotionIntensity(value: string | null): value is MotionIntensity {
  return Boolean(value && motionIntensityOptions.includes(value as MotionIntensity));
}

function isDisplayDensity(value: string | null): value is DisplayDensity {
  return Boolean(value && displayDensityOptions.includes(value as DisplayDensity));
}

export function MotionProvider({ children }: { children: ReactNode }) {
  const [motionIntensity, setMotionIntensity] = useState<MotionIntensity>(() => {
    const stored = localStorage.getItem(MOTION_INTENSITY_STORAGE_KEY);
    return isMotionIntensity(stored) ? stored : "system";
  });
  const [displayDensity, setDisplayDensity] = useState<DisplayDensity>(() => {
    const stored = localStorage.getItem(DISPLAY_DENSITY_STORAGE_KEY);
    return isDisplayDensity(stored) ? stored : "comfortable";
  });

  useEffect(() => {
    document.documentElement.dataset.motionIntensity = motionIntensity;
    localStorage.setItem(MOTION_INTENSITY_STORAGE_KEY, motionIntensity);
  }, [motionIntensity]);

  useEffect(() => {
    document.documentElement.dataset.displayDensity = displayDensity;
    localStorage.setItem(DISPLAY_DENSITY_STORAGE_KEY, displayDensity);
  }, [displayDensity]);

  return <MotionContext.Provider value={{ motionIntensity, setMotionIntensity, displayDensity, setDisplayDensity }}>{children}</MotionContext.Provider>;
}

export function useMotionPreferences() {
  const context = useContext(MotionContext);
  if (!context) throw new Error("useMotionPreferences must be used inside MotionProvider.");
  return context;
}
