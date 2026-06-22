// Food model matching your API structure
export interface Food {
  id: number;  // SQL FoodID - required for backend many-to-many tables
  description: string;
  shortDescription?: string | null;
  glycemicIndex?: number | null;
  glycemicLoad?: number | null;
  regiApproved?: boolean;
  dataSource?: string | null;
  categoryName?: string | null;
  subCategoryName?: string | null;
  nutritionFacts?: NutritionFacts;
  servingSizeMultiplicand?: number;
  servingSize?: number | null;
  servingUnit?: string | null;
  servingGramsPerUnit?: number | null;
  brandInfo?: BrandInfo;
  productPurchaseLink?: string | null;
  nutritionFactsImage?: string;
  foodImage?: string;
  foodImageThumbnail?: string;
  nutritionFactsStatus?: string;
}

export interface FoodMetadataUpdate {
  shortDescription?: string | null;
  glycemicIndex?: number | null;
  glycemicLoad?: number | null;
  regiApproved?: boolean;
  servingSizeG?: number | null;
  servingSizeMultiplicand?: number | null;
  servingSize?: number | null;
  servingUnit?: string | null;
  servingGramsPerUnit?: number | null;
  productPurchaseLink?: string | null;
}

export interface NutritionFacts {
  foodName: string;
  calories: number;
  totalFatG: number;
  saturatedFatG: number;
  transFatG: number;
  cholesterolMG: number;
  sodiumMG: number;
  totalCarbohydrateG: number;
  dietaryFiberG: number;
  totalSugarsG: number;
  addedSugarsG: number;
  proteinG: number;
  vitaminDMcg: number;
  calciumMG: number;
  ironMG: number;
  potassiumMG: number;
  servingSizeHousehold: string;
  servingSizeG: number;
  servingsPerContainer: number;
}

export interface BrandInfo {
  nutritionSiteCandidates?: string[];
  productImageSiteCandidates?: string[];
}

// ========================================
// FATSECRET COMPARE / OVERWRITE
// ========================================

export interface FatSecretCompareServing {
  servingId: string;
  servingDescription: string;
  measurementDescription: string;
  mappedUnit: string;
  gramsPerUnit: number;
  numberOfUnits: number;
  metricServingAmountG: number;
  isDefault: boolean;
  calories: number;
  proteinG: number;
  totalFatG: number;
  totalCarbG: number;
  dietaryFiberG: number;
  sodiumMG: number;
}

export interface FatSecretCompareFood {
  fatsecretFoodId: string;
  foodName: string;
  foodType: string;
  brandName?: string;
  servings: FatSecretCompareServing[];
  recommendedServingIndex: number;
  normalized100g: NutritionFacts;
  summaryCalsPer100g: number;
  summaryProteinPer100g: number;
}

export interface FatSecretCompareResponse {
  currentFood: Food;
  matches: FatSecretCompareFood[];
  recommendedMatchIndex: number;
}

export interface FatSecretOverwriteRequest {
  fatsecretFoodId: string;
  selectedServingId: string;
}
