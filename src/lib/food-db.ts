// ============================================================
// Dayflow — offline food estimator (Phase 9 Nutrition)
// ------------------------------------------------------------
// The algorithmic floor for /api/ai/food: when every Groq hop is
// exhausted (no key, quota, outage), meals described in plain
// text still get a calorie + macro estimate from this compact
// local table. Same contract as the coach's floor: the response
// is labeled source:"fallback" so the UI badges it "estimate".
//
// This is deliberately NOT a nutrition database — ~60 entries
// chosen for how often they appear in a one-line meal note
// ("2 eggs and toast with avocado"). Precision is snack-grade,
// and the confirm step in the capture sheet lets the user fix
// numbers before anything is logged.
// ============================================================

export interface FoodEstimate {
  name: string;
  calories: number;
  /** Nullable — mirrors meal_logs: a "just calories" entry is valid. */
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
}

interface FoodEntry {
  /** lowercase tokens — any one matching a description token picks the entry */
  keys: string[];
  label: string;
  kcal: number;
  p: number;
  c: number;
  f: number;
  /** per-100g entry: quantities parsed as grams scale it */
  per100g?: boolean;
}

// Per-serving values unless `per100g` (USDA-ballpark, rounded).
const FOODS: FoodEntry[] = [
  // — breakfast staples —
  { keys: ["egg", "eggs", "omelette", "omelet"], label: "Eggs", kcal: 78, p: 6, c: 1, f: 5 },
  { keys: ["toast", "bread", "slice", "slices"], label: "Whole-grain bread", kcal: 80, p: 4, c: 14, f: 1 },
  { keys: ["bagel"], label: "Bagel", kcal: 245, p: 10, c: 48, f: 1.5 },
  { keys: ["croissant"], label: "Croissant", kcal: 230, p: 5, c: 26, f: 12 },
  { keys: ["oatmeal", "oats", "porridge"], label: "Oatmeal", kcal: 150, p: 5, c: 27, f: 3 },
  { keys: ["cereal"], label: "Cereal with milk", kcal: 220, p: 8, c: 40, f: 4 },
  { keys: ["granola"], label: "Granola bar", kcal: 160, p: 4, c: 24, f: 6 },
  { keys: ["pancake", "pancakes", "waffle", "waffles"], label: "Pancakes", kcal: 175, p: 5, c: 22, f: 7 },
  // — proteins —
  { keys: ["chicken", "grilled chicken"], label: "Chicken breast", kcal: 165, p: 31, c: 0, f: 4, per100g: true },
  { keys: ["steak", "beef"], label: "Beef", kcal: 250, p: 26, c: 0, f: 17, per100g: true },
  { keys: ["salmon"], label: "Salmon", kcal: 208, p: 20, c: 0, f: 13, per100g: true },
  { keys: ["tuna"], label: "Tuna", kcal: 132, p: 28, c: 0, f: 1, per100g: true },
  { keys: ["shrimp", "prawns"], label: "Shrimp", kcal: 99, p: 24, c: 0, f: 0.3, per100g: true },
  { keys: ["pork"], label: "Pork", kcal: 242, p: 27, c: 0, f: 14, per100g: true },
  { keys: ["lamb"], label: "Lamb", kcal: 294, p: 25, c: 0, f: 21, per100g: true },
  { keys: ["burger", "hamburger", "cheeseburger"], label: "Burger", kcal: 550, p: 30, c: 40, f: 30 },
  { keys: ["sausage", "sausages", "hotdog", "hot dog"], label: "Sausage", kcal: 230, p: 13, c: 2, f: 19 },
  { keys: ["falafel"], label: "Falafel", kcal: 57, p: 2.4, c: 5, f: 3.4 }, // per ball
  { keys: ["tofu"], label: "Tofu", kcal: 76, p: 8, c: 2, f: 4.8, per100g: true },
  // — carbs / sides —
  { keys: ["rice"], label: "Cooked rice", kcal: 130, p: 2.7, c: 28, f: 0.3, per100g: true },
  { keys: ["pasta", "spaghetti", "penne", "macaroni", "noodles"], label: "Cooked pasta", kcal: 158, p: 6, c: 31, f: 0.9, per100g: true },
  { keys: ["pizza"], label: "Pizza slice", kcal: 285, p: 12, c: 36, f: 10 },
  { keys: ["fries", "chips", " french fries"], label: "Fries", kcal: 320, p: 4, c: 42, f: 15 },
  { keys: ["potato", "potatoes"], label: "Potatoes", kcal: 87, p: 2, c: 20, f: 0.1, per100g: true },
  { keys: ["sweet potato"], label: "Sweet potato", kcal: 90, p: 2, c: 21, f: 0.1, per100g: true },
  { keys: ["sandwich"], label: "Sandwich", kcal: 400, p: 20, c: 45, f: 15 },
  { keys: ["wrap", "burrito"], label: "Wrap / burrito", kcal: 520, p: 22, c: 55, f: 21 },
  { keys: ["taco", "tacos"], label: "Tacos", kcal: 210, p: 9, c: 20, f: 10 },
  { keys: ["sushi", "maki", "sashimi"], label: "Sushi roll", kcal: 300, p: 13, c: 42, f: 7 },
  { keys: ["pita"], label: "Pita bread", kcal: 165, p: 5.5, c: 33, f: 0.7 },
  { keys: ["beans", "lentils", "chickpeas"], label: "Beans / lentils", kcal: 116, p: 9, c: 20, f: 0.4, per100g: true },
  { keys: ["hummus"], label: "Hummus", kcal: 166, p: 7.9, c: 14, f: 9.6, per100g: true },
  { keys: ["quinoa"], label: "Quinoa", kcal: 120, p: 4.4, c: 21, f: 1.9, per100g: true },
  // — dairy & liquids —
  { keys: ["greek yogurt", "yogurt", "yoghurt"], label: "Yogurt", kcal: 100, p: 10, c: 6, f: 3 },
  { keys: ["milk"], label: "Milk", kcal: 42, p: 3.4, c: 5, f: 1, per100g: true },
  { keys: ["cheese"], label: "Cheese", kcal: 350, p: 25, c: 2, f: 27, per100g: true },
  { keys: ["butter"], label: "Butter", kcal: 717, p: 0.9, c: 0.1, f: 81, per100g: true },
  { keys: ["latte", "cappuccino", "coffee"], label: "Latte", kcal: 120, p: 6, c: 12, f: 4.5 },
  { keys: ["espresso", "americano", "black coffee"], label: "Black coffee", kcal: 5, p: 0.3, c: 0, f: 0 },
  { keys: ["tea"], label: "Tea with milk", kcal: 30, p: 1, c: 3, f: 1.5 },
  { keys: ["protein shake", "whey", "protein powder"], label: "Protein shake", kcal: 130, p: 25, c: 3, f: 2 },
  { keys: ["soda", "coke", "cola", "pepsi", "soft drink"], label: "Soda", kcal: 140, p: 0, c: 39, f: 0 },
  { keys: ["juice", "orange juice", "apple juice"], label: "Juice", kcal: 110, p: 1.5, c: 26, f: 0.3 },
  { keys: ["beer"], label: "Beer", kcal: 150, p: 1.6, c: 13, f: 0 },
  { keys: ["wine"], label: "Wine", kcal: 125, p: 0.1, c: 4, f: 0 },
  { keys: ["water"], label: "Water", kcal: 0, p: 0, c: 0, f: 0 },
  // — fruit & snacks —
  { keys: ["banana"], label: "Banana", kcal: 105, p: 1.3, c: 27, f: 0.4 },
  { keys: ["apple"], label: "Apple", kcal: 95, p: 0.5, c: 25, f: 0.3 },
  { keys: ["orange"], label: "Orange", kcal: 62, p: 1.2, c: 15, f: 0.2 },
  { keys: ["berries", "strawberries", "blueberries", "raspberries"], label: "Berries", kcal: 60, p: 0.8, c: 14, f: 0.3 },
  { keys: ["grapes"], label: "Grapes", kcal: 70, p: 0.6, c: 18, f: 0.2 },
  { keys: ["mango"], label: "Mango", kcal: 200, p: 2.8, c: 50, f: 1.3 },
  { keys: ["dates"], label: "Dates", kcal: 66, p: 0.4, c: 18, f: 0 },
  { keys: ["avocado"], label: "Avocado", kcal: 240, p: 3, c: 12, f: 22 },
  { keys: ["almonds", "nuts", "walnuts", "cashews"], label: "Nuts", kcal: 180, p: 6, c: 6, f: 16 }, // ~30g
  { keys: ["peanut butter"], label: "Peanut butter", kcal: 95, p: 4, c: 3, f: 8 }, // 1 tbsp
  { keys: ["chocolate", "chocolate bar"], label: "Chocolate", kcal: 230, p: 3, c: 25, f: 13 },
  { keys: ["cookie", "cookies", "biscuit", "biscuits"], label: "Cookie", kcal: 150, p: 2, c: 20, f: 7 },
  { keys: ["cake", "slice of cake"], label: "Cake", kcal: 350, p: 4, c: 50, f: 15 },
  { keys: ["ice cream"], label: "Ice cream", kcal: 210, p: 3.5, c: 26, f: 11 },
  { keys: ["donut", "doughnut"], label: "Donut", kcal: 260, p: 4, c: 31, f: 14 },
  { keys: ["honey"], label: "Honey", kcal: 64, p: 0.1, c: 17, f: 0 },
  // — meals & dishes —
  { keys: ["salad"], label: "Green salad", kcal: 120, p: 3, c: 8, f: 8 },
  { keys: ["caesar"], label: "Caesar salad", kcal: 470, p: 17, c: 12, f: 39 },
  { keys: ["soup"], label: "Soup", kcal: 180, p: 6, c: 22, f: 7 },
  { keys: ["curry"], label: "Curry", kcal: 450, p: 20, c: 30, f: 27 },
  { keys: ["stir fry", "stir-fry", "stirfry"], label: "Stir fry", kcal: 400, p: 22, c: 30, f: 20 },
  { keys: ["shawarma", "shish tawook"], label: "Shawarma", kcal: 500, p: 28, c: 40, f: 25 },
  { keys: ["koshari", "koshary"], label: "Koshari", kcal: 680, p: 20, c: 120, f: 14 },
];

// ---------- quantity parsing ----------

const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10, couple: 2,
  half: 0.5, quarter: 0.25, dozen: 12,
};

interface ParsedQuantity {
  /** count multiplier for per-serving entries */
  count: number;
  /** grams if the user wrote "<n>g" / "<n> grams" */
  grams: number | null;
}

function parseQuantity(tokens: string[]): ParsedQuantity {
  let count = 1;
  let grams: number | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    // glued form: "200g"
    const glued = /^(\d+(?:\.\d+)?)g$/.exec(t);
    if (glued) {
      grams = Number(glued[1]);
      continue;
    }
    const numeric = /^(\d+(?:\.\d+)?)$/.exec(t);
    if (numeric) {
      const n = Number(numeric[1]);
      // "200 g" / "200 grams"
      if (i + 1 < tokens.length && /^(g|gr|gram|grams|gm)$/.test(tokens[i + 1])) {
        grams = n;
      } else {
        count = n;
      }
      continue;
    }
    if (t in WORD_NUMBERS) count = WORD_NUMBERS[t];
  }
  return { count, grams };
}

const strip = (s: string) => s.toLowerCase().replace(/[^a-z0-9.]+/g, " ").trim();

/** One entry hit: the entry plus the (longest) key that triggered it. */
interface EntryHit {
  entry: FoodEntry;
  keyWords: Set<string>;
  keyLen: number;
}

/**
 * Estimate a meal from a free-text description. Returns null when
 * nothing in the description matches any entry — the caller then
 * asks for a manual entry instead of inventing numbers.
 */
export function estimateMealFromText(description: string): FoodEstimate | null {
  const tokens = strip(description).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  const { count, grams } = parseQuantity(tokens);

  // Collect one hit per entry, triggered by its LONGEST matching key.
  const hits = new Map<FoodEntry, EntryHit>();
  for (const entry of FOODS) {
    let best: EntryHit | null = null;
    for (const key of entry.keys) {
      const words = strip(key).split(/\s+/).filter(Boolean);
      if (words.length === 0) continue;
      if (words.every((w) => tokens.includes(w)) && (!best || words.length > best.keyLen)) {
        best = { entry, keyWords: new Set(words), keyLen: words.length };
      }
    }
    if (best) hits.set(entry, best);
  }
  if (hits.size === 0) return null;

  // Specific-first: when a specific entry (peanut butter, black
  // coffee) already covers a generic one's trigger words (butter,
  // coffee), the generic entry is dropped instead of double-counted.
  const ranked = [...hits.values()].sort((a, b) => b.keyLen - a.keyLen);
  const kept: EntryHit[] = [];
  for (const hit of ranked) {
    const subsumed = kept.some((k) =>
      [...hit.keyWords].every((w) => k.keyWords.has(w))
    );
    if (!subsumed) kept.push(hit);
  }

  let kcal = 0, p = 0, c = 0, f = 0;
  const names: string[] = [];
  for (const { entry } of kept) {
    const scale = entry.per100g
      ? grams != null
        ? grams / 100
        : Math.max(1, count) * 1.5 // no grams given: assume a ~150g serving
      : Math.max(0.25, count);
    kcal += entry.kcal * scale;
    p += entry.p * scale;
    c += entry.c * scale;
    f += entry.f * scale;
    names.push(entry.label);
  }

  return {
    name: kept.length === 1 ? kept[0].entry.label : names.slice(0, 3).join(" + "),
    calories: Math.round(kcal),
    protein_g: Math.round(p),
    carbs_g: Math.round(c),
    fat_g: Math.round(f),
  };
}

// ---------- target calculator (Mifflin-St Jeor, ported from the
// Cal AI clone's CustomPlanPage) ----------

export interface NutritionTargets {
  calorieTarget: number;
  proteinTargetG: number;
  carbTargetG: number;
  fatTargetG: number;
}

export interface PlanInputs {
  sex: "male" | "female";
  heightCm: number;
  weightKg: number;
  age: number;
  /** workouts per week */
  activityLevel: "low" | "medium" | "high";
  goal: "lose" | "maintain" | "gain";
}

const ACTIVITY_FACTOR: Record<PlanInputs["activityLevel"], number> = {
  low: 1.2, // 0–2 workouts / week
  medium: 1.375, // 3–5
  high: 1.55, // 6+
};

/** Mifflin-St Jeor BMR → TDEE → goal adjustment → macro split. */
export function calculateNutritionPlan(input: PlanInputs): NutritionTargets {
  const { sex, heightCm, weightKg, age, activityLevel, goal } = input;
  const bmr =
    10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "male" ? 5 : -161);
  const tdee = bmr * ACTIVITY_FACTOR[activityLevel];

  let calories = tdee;
  if (goal === "lose") calories = tdee - 550; // ≈0.5 kg/week
  if (goal === "gain") calories = tdee * 1.15;

  const proteinG = weightKg * 2.0;
  const fatG = weightKg * 0.8;
  const carbG = Math.max(30, (calories - proteinG * 4 - fatG * 9) / 4);

  return {
    calorieTarget: Math.round(calories),
    proteinTargetG: Math.round(proteinG),
    carbTargetG: Math.round(carbG),
    fatTargetG: Math.round(fatG),
  };
}

/** Fallback targets when the profile has none set yet. */
export const DEFAULT_NUTRITION_TARGETS: NutritionTargets = {
  calorieTarget: 2200,
  proteinTargetG: 140,
  carbTargetG: 220,
  fatTargetG: 70,
};
