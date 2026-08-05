// Hand-derived mirror of c:\git\regi-api\schemas\meal.schema.json (the Meal READ side).
// The JSON Schema is authoritative — keep this in sync by re-reading the schema; never
// invent, rename, add, or drop a field the schema doesn't have.
//
// The admin list (GET /api/admin/meals) returns MealSummary; the full Meal (GET
// /api/meal/{id}) carries the complete flag set. Both include shareApproved.

export type MealType = 'meal' | 'snack';
export type FoodSource = 'food' | 'userfood' | 'pending';
export type ItemRole = 'primary' | 'secondary' | 'side' | 'ingredient';

/** The full resolved food record nested under a meal item (null for pending/unresolved AI items). */
export interface MealItemFood {
  foodId: number;
  foodSource: 'food' | 'userfood';
  description: string;
  shortDescription?: string | null;
  categoryName?: string | null;
  dataSource?: string | null;
  foodImage?: string | null;
  foodImageThumbnail?: string | null;
  servingSize?: number | null;
  servingUnit?: string | null;
  servingGramsPerUnit?: number | null;
  servingSizeG?: number | null;
  calories?: number | null;
  proteinG?: number | null;
  fatG?: number | null;
  carbG?: number | null;
  fiberG?: number | null;
  sodiumMg?: number | null;
  productPurchaseLink?: string | null;
  dynamicIngredient: boolean;
}

/** A meal line: quantity + unit + role + per-item scaled macros, with the resolved food nested under `food`. */
export interface MealItem {
  id?: number;
  foodName: string;
  itemRole: ItemRole;
  isTracked: boolean;
  quantity: number;
  unit: string;
  calories?: number;
  proteinG?: number;
  fatG?: number;
  carbG?: number;
  fiberG?: number;
  sodiumMg?: number;
  sortOrder?: number;
  food?: MealItemFood | null;
}

/** Full meal detail — GET /api/meal/{id}. */
export interface Meal {
  id: number;
  name: string;
  mealType: MealType;
  mealSeqNum: number;
  primaryProteinFoodId?: number | null;
  primaryProteinName?: string | null;
  isRegiApproved: boolean;
  pinned: boolean;
  cloned: boolean;
  clonedFromMealId?: number | null;
  rating?: number | null;
  totalCalories?: number;
  totalProteinG?: number;
  totalFatG?: number;
  totalCarbG?: number;
  totalFiberG?: number;
  totalSodiumMg?: number;
  prepVideoLink?: string;
  recipeLink?: string;
  mealImage?: string;
  mealImageThumbnail?: string;
  servings: number;
  shareCandidate: boolean;
  shareApproved: boolean;
  items?: MealItem[];
  createdAt: string;
  updatedAt: string;
}

/** Lightweight list row — GET /api/admin/meals (`{ meals, count }`). */
export interface MealSummary {
  id: number;
  name: string;
  mealSeqNum: number;
  primaryProteinFoodId?: number | null;
  primaryProteinName?: string | null;
  isRegiApproved: boolean;
  pinned?: boolean;
  totalCalories?: number;
  totalProteinG?: number;
  totalFatG?: number;
  totalCarbG?: number;
  totalFiberG?: number;
  totalSodiumMg?: number;
  mealImageThumbnail?: string;
  servings: number;
  shareCandidate: boolean;
  shareApproved?: boolean;
  userName?: string;
  userEmail?: string;
  createdAt: string;
}
