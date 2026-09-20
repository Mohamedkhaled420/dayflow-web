"use client";

// MealCaptureSheet — Cal AI-style food logging (Phase 9 Nutrition).
// Three entry paths, one confirm step:
//   1. Photo    — camera/gallery (file input with capture hint) →
//                 downscale client-side → /api/ai/food vision cascade
//   2. Describe — free text ("2 eggs and toast with avocado") →
//                 /api/ai/food text cascade → offline estimator floor
//   3. Manual   — name + kcal + macros typed by hand, no AI
// The AI never writes to meal_logs directly — every estimate lands
// on an EDITABLE confirm step, and only the user's "Log meal" tap
// creates the row (source: 'ai' | 'manual', so the UI can badge
// estimates honestly).
//
// Form state lives in a keyed inner component (MealCaptureForm) so
// each open mounts fresh values — no setState-in-effect syncing,
// same discipline as EventDialog.

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Camera,
  Check,
  ImagePlus,
  Keyboard,
  PencilLine,
  ScanLine,
  X,
} from "lucide-react";
import { useDayflowStore } from "@/store/useDayflowStore";
import { localDateTime } from "@/lib/viewmodel";
import { useToast } from "@/hooks/use-toast";
import { useIsPhone } from "@/hooks/use-media-query";
import { useDockHideRequest } from "@/hooks/use-dock-visibility";
import { triggerHaptic } from "@/lib/haptics";
import { useKeyboardTracking } from "@/components/ui/Sheet";
import { CATEGORY_COLORS, MACRO_COLORS } from "@/styles/palette";
import { springSoft } from "@/lib/motion";

const MEALS_COLOR = CATEGORY_COLORS.meals;

const pad = (n: number) => String(n).padStart(2, "0");
const nowHM = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

interface EstimateDraft {
  name: string;
  calories: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Target day (defaults to today). Meals log at the current clock time. */
  dateKey?: string;
}

type Step = "pick" | "photo" | "describe" | "manual" | "confirm";

/** Downscale to max 1024px on the long edge, JPEG q0.82 — keeps the
 *  base64 payload small enough for a JSON POST on mobile data. */
async function downscaleToBase64(file: File): Promise<{ base64: string; dataUrl: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("decode failed"));
    el.src = dataUrl;
  });
  const maxDim = 1024;
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return { base64: dataUrl.split(",")[1] ?? "", dataUrl };
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const jpeg = canvas.toDataURL("image/jpeg", 0.82);
  return { base64: jpeg.split(",")[1] ?? "", dataUrl: jpeg };
}

export function MealCaptureSheet({ open, onClose, dateKey }: Props) {
  const isPhone = useIsPhone();
  // Overlay owns the bottom band while open (dock-avoidance Rule B).
  useDockHideRequest("overlay:meal-sheet", open);
  if (!isPhone) {
    return (
      <AnimatePresence>
        {open && (
          <DesktopShell onClose={onClose}>
            <MealCaptureForm onClose={onClose} dateKey={dateKey} />
          </DesktopShell>
        )}
      </AnimatePresence>
    );
  }
  return (
    <AnimatePresence>
      {open && (
        <SheetShell onClose={onClose}>
          <MealCaptureForm onClose={onClose} dateKey={dateKey} />
        </SheetShell>
      )}
    </AnimatePresence>
  );
}

function MealCaptureForm({ onClose, dateKey }: { onClose: () => void; dateKey?: string }) {
  const addMealLog = useDayflowStore((s) => s.addMealLog);
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("pick");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<{ base64: string; dataUrl: string } | null>(null);
  const [note, setNote] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState<"ai" | "fallback" | "manual">("manual");
  const [draft, setDraft] = useState<EstimateDraft>({
    name: "",
    calories: "",
    protein_g: "",
    carbs_g: "",
    fat_g: "",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lock body scroll while mounted (external system — allowed in effect).
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.overscrollBehavior = prevOverscroll;
    };
  }, []);

  useKeyboardTracking();

  const onPickFile = async (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    try {
      const scaled = await downscaleToBase64(file);
      setPhoto(scaled);
      setError(null);
    } catch {
      setError("Couldn't read that image — try another one.");
    }
  };

  const applyEstimate = (
    est: { name: string; calories: number; protein_g: number | null; carbs_g: number | null; fat_g: number | null },
    src: "ai" | "fallback"
  ) => {
    setDraft({
      name: est.name,
      calories: String(est.calories),
      protein_g: est.protein_g != null ? String(est.protein_g) : "",
      carbs_g: est.carbs_g != null ? String(est.carbs_g) : "",
      fat_g: est.fat_g != null ? String(est.fat_g) : "",
    });
    setSource(src);
    setStep("confirm");
  };

  const analyze = async () => {
    setBusy(true);
    setError(null);
    try {
      const { createClient } = await import("@/utils/supabase/client");
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      let token = sessionData.session?.access_token ?? null;
      if (!token) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        token = refreshed.session?.access_token ?? null;
      }
      if (!token) {
        setError("Sign in again — your session expired.");
        return;
      }
      const res = await fetch("/api/ai/food", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...(photo ? { imageBase64: photo.base64, mimeType: "image/jpeg" as const } : {}),
          ...(description || note ? { description: (note || description).slice(0, 500) } : {}),
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { estimate?: Record<string, unknown>; source?: "ai" | "fallback"; code?: string; error?: string }
        | null;

      if (res.ok && body?.estimate) {
        const est = body.estimate as unknown as {
          name: string; calories: number; protein_g: number | null; carbs_g: number | null; fat_g: number | null;
        };
        applyEstimate(est, body.source ?? "ai");
        return;
      }
      const code = body?.code ?? "FOOD_UNAVAILABLE";
      if (code === "FOOD_VISION_UNAVAILABLE") {
        setError("Couldn't analyze the photo — describe it in words instead.");
        setDescription(note);
        setPhoto(null);
        setStep("describe");
      } else if (code === "NO_FOOD_MATCH") {
        setError("No match — enter it manually?");
        setDraft((d) => ({ ...d, name: description.slice(0, 60) }));
        setStep("manual");
      } else {
        setError(body?.error ?? "Estimation failed — try again in a moment.");
      }
    } catch {
      setError("Network hiccup — try again.");
    } finally {
      setBusy(false);
    }
  };

  const validNumbers =
    draft.name.trim().length > 0 &&
    draft.calories.trim() !== "" &&
    Number.isFinite(Number(draft.calories)) &&
    Number(draft.calories) >= 0;

  const logMeal = async (src: string) => {
    if (!validNumbers) return;
    const todayKey = new Date().toISOString().slice(0, 10);
    const target = dateKey ?? todayKey;
    const isToday = target === todayKey;
    await addMealLog({
      name: draft.name.trim(),
      calories: Math.round(Number(draft.calories)),
      protein_g: draft.protein_g.trim() === "" ? null : Math.round(Number(draft.protein_g)),
      carbs_g: draft.carbs_g.trim() === "" ? null : Math.round(Number(draft.carbs_g)),
      fat_g: draft.fat_g.trim() === "" ? null : Math.round(Number(draft.fat_g)),
      source: src,
      logged_at: isToday ? new Date().toISOString() : localDateTime(target, nowHM()),
    });
    triggerHaptic();
    toast({
      title: "Meal logged",
      description: `${draft.name.trim()} · ${Math.round(Number(draft.calories))} kcal`,
    });
    onClose();
  };

  return (
    <div className="w-full">
      <Header step={step} onClose={onClose} />
      {error && (
        <div
          className="mt-3 rounded-md px-3 py-2 text-[12px]"
          style={{
            background: "color-mix(in srgb, var(--df-destructive-soft) 12%, transparent)",
            border: "0.5px solid color-mix(in srgb, var(--df-destructive-soft) 30%, transparent)",
            color: "var(--df-destructive-text)",
          }}
          role="alert"
        >
          {error}
        </div>
      )}

      {step === "pick" && (
        <div className="mt-4 grid grid-cols-1 gap-2">
          <PickCard
            icon={<Camera className="h-5 w-5" />}
            title="Snap a photo"
            sub="Point at the food — AI estimates calories & macros"
            onClick={() => setStep("photo")}
          />
          <PickCard
            icon={<Keyboard className="h-5 w-5" />}
            title="Describe it"
            sub={'"2 eggs and toast with avocado"'}
            onClick={() => setStep("describe")}
          />
          <PickCard
            icon={<PencilLine className="h-5 w-5" />}
            title="Enter manually"
            sub="You know the numbers — type them"
            onClick={() => setStep("manual")}
          />
        </div>
      )}

      {step === "photo" && (
        <div className="mt-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => void onPickFile(e.target.files?.[0])}
          />
          {photo ? (
            <div className="relative overflow-hidden rounded-xl" style={{ border: "0.5px solid var(--df-chip-border)" }}>
              {/* Local object URL the user just created — no remote
                  hosting, no optimization target for next/image. */}
              <img src={photo.dataUrl} alt="Meal photo preview" className="w-full max-h-56 object-cover" />
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="df-press w-full rounded-xl py-7 flex flex-col items-center gap-2"
              style={{
                background: "var(--df-input-fill)",
                border: `1.5px dashed color-mix(in srgb, ${MEALS_COLOR} 45%, transparent)`,
              }}
            >
              <ImagePlus className="h-6 w-6" style={{ color: MEALS_COLOR }} />
              <span className="text-[12.5px] font-semibold" style={{ color: "var(--df-text-primary)" }}>
                Take or choose a photo
              </span>
              <span className="text-[11px]" style={{ color: "var(--df-text-muted)" }}>
                Camera or gallery · stays on your device until analyzed
              </span>
            </button>
          )}
          <div className="mt-3">
            <FieldLabel>Add a note (optional)</FieldLabel>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 200))}
              placeholder="e.g. large plate, half eaten"
              aria-label="Photo note"
              className="df-input-glass w-full rounded-md px-3 h-11 outline-none text-base"
              style={{
                color: "var(--df-text-primary)",
              }}
            />
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button onClick={() => setStep("pick")} className="df-press df-btn-secondary df-btn-capsule h-11 px-4 text-[12.5px] font-semibold">
              Back
            </button>
            <div className="flex-1" />
            <button
              onClick={() => void analyze()}
              disabled={!photo || busy}
              className="df-press df-btn-primary df-btn-capsule h-11 px-4 text-[12.5px] font-semibold flex items-center gap-1.5 disabled:opacity-40"
            >
              <ScanLine className="h-3.5 w-3.5" />
              {busy ? "Analyzing…" : "Analyze photo"}
            </button>
          </div>
        </div>
      )}

      {step === "describe" && (
        <div className="mt-4">
          <FieldLabel>What did you eat?</FieldLabel>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 500))}
            placeholder="2 eggs and toast with avocado"
            aria-label="Meal description"
            rows={3}
            className="df-input-glass w-full rounded-md px-3 py-2.5 outline-none text-base resize-none"
            style={{
              color: "var(--df-text-primary)",
            }}
          />
          <div className="mt-4 flex items-center gap-2">
            <button onClick={() => setStep("pick")} className="df-press df-btn-secondary df-btn-capsule h-11 px-4 text-[12.5px] font-semibold">
              Back
            </button>
            <div className="flex-1" />
            <button
              onClick={() => void analyze()}
              disabled={description.trim().length < 2 || busy}
              className="df-press df-btn-primary df-btn-capsule h-11 px-4 text-[12.5px] font-semibold flex items-center gap-1.5 disabled:opacity-40"
            >
              <ScanLine className="h-3.5 w-3.5" />
              {busy ? "Estimating…" : "Estimate"}
            </button>
          </div>
        </div>
      )}

      {(step === "manual" || step === "confirm") && (
        <div className="mt-4">
          {step === "confirm" && (
            <div
              className="mb-3 rounded-md px-3 py-2 text-[11px] font-semibold"
              style={{
                background:
                  source === "ai"
                    ? `color-mix(in srgb, ${MEALS_COLOR} 14%, transparent)`
                    : "var(--df-chip-fill)",
                border: `0.5px solid color-mix(in srgb, ${MEALS_COLOR} 40%, transparent)`,
                color: "var(--df-text-secondary)",
              }}
            >
              {source === "ai"
                ? "AI estimate — check the numbers before logging"
                : "Offline estimate — check the numbers before logging"}
            </div>
          )}
          <FieldLabel>Meal</FieldLabel>
          <input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value.slice(0, 80) }))}
            placeholder="Grilled chicken salad"
            aria-label="Meal name"
            className="w-full rounded-md px-3 h-12 outline-none text-base"
            style={{
              background: "var(--df-input-fill)",
              border: "0.5px solid var(--df-input-border)",
              color: "var(--df-text-primary)",
            }}
          />
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <MacroInput
              label="Calories"
              unit="kcal"
              color={MEALS_COLOR}
              value={draft.calories}
              onChange={(v) => setDraft((d) => ({ ...d, calories: v }))}
            />
            <MacroInput
              label="Protein"
              unit="g"
              color={MACRO_COLORS.protein}
              value={draft.protein_g}
              onChange={(v) => setDraft((d) => ({ ...d, protein_g: v }))}
            />
            <MacroInput
              label="Carbs"
              unit="g"
              color={MACRO_COLORS.carbs}
              value={draft.carbs_g}
              onChange={(v) => setDraft((d) => ({ ...d, carbs_g: v }))}
            />
            <MacroInput
              label="Fat"
              unit="g"
              color={MACRO_COLORS.fat}
              value={draft.fat_g}
              onChange={(v) => setDraft((d) => ({ ...d, fat_g: v }))}
            />
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={() => setStep("pick")}
              className="df-press df-btn-secondary df-btn-capsule h-11 px-4 text-[12.5px] font-semibold"
            >
              Back
            </button>
            <div className="flex-1" />
            <button
              onClick={() => void logMeal(step === "manual" ? "manual" : source === "fallback" ? "manual" : "ai")}
              disabled={!validNumbers}
              className="df-press df-btn-primary df-btn-capsule h-11 px-4 text-[12.5px] font-semibold flex items-center gap-1.5 disabled:opacity-40"
            >
              <Check className="h-3.5 w-3.5" />
              Log meal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Header({ step, onClose }: { step: Step; onClose: () => void }) {
  const title =
    step === "pick"
      ? "Log a meal"
      : step === "photo"
        ? "Photo"
        : step === "describe"
          ? "Describe it"
          : step === "manual"
            ? "Manual entry"
            : "Confirm estimate";
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[16px] font-bold tracking-tight" style={{ color: "var(--df-text-primary)" }}>
          {title}
        </h2>
        <p className="text-[11.5px] mt-0.5" style={{ color: "var(--df-text-muted)" }}>
          Calories & macros, the Cal AI way
        </p>
      </div>
      <button
        onClick={onClose}
        aria-label="Close"
        className="df-press shrink-0 -mt-0.5 h-8 w-8 rounded-full grid place-items-center"
        style={{
          background: "var(--df-chip-fill)",
          border: "0.5px solid var(--df-chip-border)",
          color: "var(--df-text-secondary)",
        }}
      >
        <X className="h-4 w-4" strokeWidth={2.2} />
      </button>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="text-[10.5px] font-bold uppercase tracking-[0.06em]"
      style={{ color: "var(--df-text-secondary)" }}
    >
      {children}
    </label>
  );
}

function PickCard({
  icon,
  title,
  sub,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={() => {
        triggerHaptic();
        onClick();
      }}
      className="df-press w-full rounded-xl px-4 py-3.5 flex items-center gap-3.5 text-left"
      style={{
        background: "var(--df-input-fill)",
        border: "0.5px solid var(--df-chip-border)",
      }}
    >
      <span
        className="shrink-0 h-10 w-10 rounded-[12px] grid place-items-center"
        style={{
          background: `color-mix(in srgb, ${MEALS_COLOR} 15%, transparent)`,
          color: MEALS_COLOR,
        }}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-semibold" style={{ color: "var(--df-text-primary)" }}>
          {title}
        </span>
        <span className="block text-[11.5px] mt-0.5 truncate" style={{ color: "var(--df-text-muted)" }}>
          {sub}
        </span>
      </span>
    </button>
  );
}

function MacroInput({
  label,
  unit,
  color,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  color: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <FieldLabel>
        <span style={{ color }}>{label}</span>
        <span className="normal-case font-medium opacity-70"> ({unit})</span>
      </FieldLabel>
      <div
        className="df-input-glass mt-1.5 rounded-md px-3 h-12 flex items-center"
        style={{
          border: `0.5px solid color-mix(in srgb, ${color} 30%, var(--df-input-border))`,
        }}
      >
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))}
          inputMode="numeric"
          placeholder="—"
          aria-label={`${label} in ${unit}`}
          className="w-full bg-transparent outline-none text-base tabular-nums"
          style={{ color: "var(--df-text-primary)" }}
        />
      </div>
    </div>
  );
}

// ---------- shells ----------

function Scrim({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      className="fixed inset-0 z-[60] flex justify-center p-0 sm:p-4 items-end sm:items-center"
      style={{
        background: "var(--df-scrim)",
        backdropFilter: "blur(3px)",
        transform: "translateZ(0)",
        willChange: "transform",
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Log a meal"
    >
      {children}
    </motion.div>
  );
}

function DesktopShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const reducedMotion = useReducedMotion();
  return (
    <Scrim onClose={onClose}>
      <motion.div
        initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.97 }}
        animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
        exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.97 }}
        transition={reducedMotion ? { duration: 0.18 } : springSoft}
        className="w-full max-w-[420px] rounded-2xl p-5 df-material"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </Scrim>
  );
}

function SheetShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const reducedMotion = useReducedMotion();
  return (
    <Scrim onClose={onClose}>
      <motion.div
        initial={reducedMotion ? { opacity: 0 } : { y: "100%", opacity: 0.6 }}
        animate={reducedMotion ? { opacity: 1 } : { y: 0, opacity: 1 }}
        exit={reducedMotion ? { opacity: 0 } : { y: "100%", opacity: 0.5 }}
        transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
        className="w-full rounded-t-[24px] overflow-hidden df-material"
        style={{
          /* Keyboard lift (MealCaptureForm tracks --keyboard-height):
             ride above the software keyboard, cap the panel so it never
             runs off the top edge. */
          marginBottom: "var(--keyboard-height, 0px)",
          maxHeight: "calc(100dvh - var(--keyboard-height, 0px))",
          transition: "margin-bottom 220ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2.5 mb-1 h-[5px] w-9 rounded-full" style={{ background: "var(--df-chip-border)" }} />
        <div className="df-scroll overflow-y-auto px-5 pb-[max(18px,env(safe-area-inset-bottom))] max-h-[calc(82dvh-var(--keyboard-height,0px))]">
          {children}
        </div>
      </motion.div>
    </Scrim>
  );
}
