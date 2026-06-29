import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { FatSecretCompareResponse, FatSecretCompareFood, FatSecretCompareServing, NutritionFacts } from '../models/food.model';

interface NutrientRow {
  label: string;
  unit: string;
  // null = no data on that side (rendered as "—"). Never coerced to 0 for
  // compare — a missing value isn't equal to a known zero.
  currentValue: number | null;
  fatsecretValue: number | null;
  differs: boolean;
}

@Component({
  selector: 'app-fatsecret-compare',
  templateUrl: './fatsecret-compare.component.html',
  styleUrls: ['./fatsecret-compare.component.scss']
})
export class FatsecretCompareComponent implements OnChanges {
  @Input() data: FatSecretCompareResponse | null = null;
  @Output() overwrite = new EventEmitter<{ fatsecretFoodId: string; selectedServingId: string }>();
  @Output() close = new EventEmitter<void>();

  selectedMatchIndex = 0;
  selectedServingIndex = 0;
  nutrientRows: NutrientRow[] = [];
  isDragging = false;
  dragOffset = { x: 0, y: 0 };
  position = { x: 100, y: 60 };

  get selectedMatch(): FatSecretCompareFood | null {
    if (!this.data?.matches?.length) return null;
    return this.data.matches[this.selectedMatchIndex] ?? null;
  }

  get selectedServing(): FatSecretCompareServing | null {
    const match = this.selectedMatch;
    if (!match?.servings?.length) return null;
    return match.servings[this.selectedServingIndex] ?? null;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] && this.data) {
      this.selectedMatchIndex = this.data.recommendedMatchIndex;
      this.onMatchChanged();
    }
  }

  onMatchChanged(): void {
    const match = this.selectedMatch;
    if (match) {
      this.selectedServingIndex = match.recommendedServingIndex;
    }
    this.buildNutrientRows();
  }

  onServingChanged(): void {
    // Serving change doesn't affect nutrition comparison (always 100g normalized)
    // but we could update the serving preview
  }

  onOverwrite(): void {
    const match = this.selectedMatch;
    const serving = this.selectedServing;
    if (match && serving) {
      this.overwrite.emit({
        fatsecretFoodId: match.fatsecretFoodId,
        selectedServingId: serving.servingId
      });
    }
  }

  onClose(): void {
    this.close.emit();
  }

  // Drag support
  onMouseDown(event: MouseEvent): void {
    this.isDragging = true;
    this.dragOffset = {
      x: event.clientX - this.position.x,
      y: event.clientY - this.position.y
    };
    event.preventDefault();
  }

  onMouseMove(event: MouseEvent): void {
    if (!this.isDragging) return;
    this.position = {
      x: event.clientX - this.dragOffset.x,
      y: event.clientY - this.dragOffset.y
    };
  }

  onMouseUp(): void {
    this.isDragging = false;
  }

  private buildNutrientRows(): void {
    const current = this.data?.currentFood?.nutritionFacts;
    const fs = this.selectedMatch?.normalized100g;
    if (!current || !fs) {
      this.nutrientRows = [];
      return;
    }

    const rows: { label: string; unit: string; currentKey: keyof NutritionFacts; fsKey: keyof NutritionFacts }[] = [
      { label: 'Calories', unit: 'kcal', currentKey: 'calories', fsKey: 'calories' },
      { label: 'Protein', unit: 'g', currentKey: 'proteinG', fsKey: 'proteinG' },
      { label: 'Total Fat', unit: 'g', currentKey: 'totalFatG', fsKey: 'totalFatG' },
      { label: 'Saturated Fat', unit: 'g', currentKey: 'saturatedFatG', fsKey: 'saturatedFatG' },
      { label: 'Trans Fat', unit: 'g', currentKey: 'transFatG', fsKey: 'transFatG' },
      { label: 'Cholesterol', unit: 'mg', currentKey: 'cholesterolMG', fsKey: 'cholesterolMG' },
      { label: 'Sodium', unit: 'mg', currentKey: 'sodiumMG', fsKey: 'sodiumMG' },
      { label: 'Total Carbs', unit: 'g', currentKey: 'totalCarbohydrateG', fsKey: 'totalCarbohydrateG' },
      { label: 'Dietary Fiber', unit: 'g', currentKey: 'dietaryFiberG', fsKey: 'dietaryFiberG' },
      { label: 'Total Sugars', unit: 'g', currentKey: 'totalSugarsG', fsKey: 'totalSugarsG' },
      { label: 'Added Sugars', unit: 'g', currentKey: 'addedSugarsG', fsKey: 'addedSugarsG' },
      { label: 'Vitamin D', unit: 'mcg', currentKey: 'vitaminDMcg', fsKey: 'vitaminDMcg' },
      { label: 'Calcium', unit: 'mg', currentKey: 'calciumMG', fsKey: 'calciumMG' },
      { label: 'Iron', unit: 'mg', currentKey: 'ironMG', fsKey: 'ironMG' },
      { label: 'Potassium', unit: 'mg', currentKey: 'potassiumMG', fsKey: 'potassiumMG' },
    ];

    this.nutrientRows = rows.map(r => {
      const cv = this.numVal(current[r.currentKey]);
      const fv = this.numVal(fs[r.fsKey]);
      // null = no data on either side. We refuse to assert equality OR
      // difference when one side is unknown — render "—" and skip the diff
      // highlight (a known 0 vs no-data IS a real semantic difference, but
      // displaying it as "differs" would mislead the user into thinking one
      // source reported a value).
      if (cv === null || fv === null) {
        return {
          label: r.label,
          unit: r.unit,
          currentValue: cv,
          fatsecretValue: fv,
          differs: false,
        };
      }
      const threshold = Math.max(cv, fv) * 0.01; // 1% of larger value
      return {
        label: r.label,
        unit: r.unit,
        currentValue: cv,
        fatsecretValue: fv,
        differs: Math.abs(cv - fv) > Math.max(threshold, 0.1)
      };
    });
  }

  // null = no data (missing or non-numeric). Distinct from 0, which means
  // "known zero" and IS a comparable value.
  private numVal(v: any): number | null {
    return typeof v === 'number' ? Math.round(v * 10) / 10 : null;
  }

  // Serving info rows for display
  get servingInfoRows(): { label: string; current: string; fatsecret: string; differs: boolean }[] {
    const food = this.data?.currentFood;
    const serving = this.selectedServing;
    if (!food || !serving) return [];

    const currentNf = food.nutritionFacts;
    return [
      {
        label: 'Serving Unit',
        current: food.servingUnit || '(none)',
        fatsecret: serving.mappedUnit,
        differs: (food.servingUnit || '') !== serving.mappedUnit
      },
      // For each numeric row: a missing current value (null/undefined) is not
      // a known 0 — refuse to flag it as "differs". The "(none)" display is
      // the signal to the user that there's no value to compare against.
      {
        label: 'Grams/Unit',
        current: food.servingGramsPerUnit?.toFixed(1) ?? '(none)',
        fatsecret: serving.gramsPerUnit.toFixed(1),
        differs: food.servingGramsPerUnit != null &&
          Math.abs(food.servingGramsPerUnit - serving.gramsPerUnit) > 0.1
      },
      {
        label: 'Serving Size (g)',
        current: currentNf?.servingSizeG?.toFixed(1) ?? '(none)',
        fatsecret: serving.metricServingAmountG.toFixed(1),
        differs: currentNf?.servingSizeG != null &&
          Math.abs(currentNf.servingSizeG - serving.metricServingAmountG) > 0.1
      },
      {
        label: 'Multiplicand',
        current: food.servingSizeMultiplicand?.toFixed(2) ?? '(none)',
        fatsecret: (serving.metricServingAmountG / 100).toFixed(2),
        differs: food.servingSizeMultiplicand != null &&
          Math.abs(food.servingSizeMultiplicand - serving.metricServingAmountG / 100) > 0.01
      },
      {
        label: 'Household',
        current: currentNf?.servingSizeHousehold ?? '(none)',
        fatsecret: serving.servingDescription,
        differs: (currentNf?.servingSizeHousehold ?? '') !== serving.servingDescription
      }
    ];
  }
}
