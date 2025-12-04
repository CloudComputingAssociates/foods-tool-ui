// Food model matching your API structure
export interface Food {
  id: number;  // SQL FoodID - required for backend many-to-many tables
  description: string;
  shortDescription?: string | null;
  glycemicIndex?: number | null;
  glycemicLoad?: number | null;
  nutritionFacts?: NutritionFacts;
  servingSizeMultiplicand?: number;
  brandInfo?: BrandInfo;
  nutritionFactsImage?: string;
  foodImage?: string;
  foodImageThumbnail?: string;
  nutritionFactsStatus?: string;
}

export interface FoodMetadataUpdate {
  shortDescription?: string | null;
  glycemicIndex?: number | null;
  glycemicLoad?: number | null;
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
