import { Component, OnInit, ChangeDetectorRef, ViewChild } from '@angular/core';
import { FormControl } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RegiApiService } from '../services/regi-api.service';
import { HttpErrorResponse } from '@angular/common/http';
import { Food, FoodMetadataUpdate, FatSecretCompareResponse } from '../models/food.model';
import { ImageUploadComponent } from '../image-upload/image-upload.component';

interface SimplifiedNutrient {
  label: string;
  value: number;
  unit: string;
}

interface ImageUploadResponse {
  success: boolean;
  nutritionImageUploaded: boolean;
  productImageUploaded: boolean;
  nutritionFactsStatus: string;
  message: string;
}

interface FoodGroup {
  category: string;
  foods: { food: Food; flatIndex: number }[];
  collapsed: boolean;
}

@Component({
  selector: 'app-foods',
  templateUrl: './foods.component.html',
  styleUrls: ['./foods.component.scss']
})
export class FoodsComponent implements OnInit {
  @ViewChild(ImageUploadComponent) imageUploadComponent!: ImageUploadComponent;

  searchControl = new FormControl('');
  limitControl = new FormControl(300);  // Default to 300 results (was 50)
  listFilterControl = new FormControl<string>('regi-approved');  // Default to Regi Approved list
  availableLists: { name: string; description: string; toolTip?: string }[] = [];
  foods: Food[] = [];  // Array of all search results (typed as Food[])
  selectedFood: Food | null = null;  // RENAMED from currentFood
  selectedIndex: number = 0;  // Track selected item for detail view
  resultCount: number | null = null;  // Post-filter count shown on apply button

  // NEW: Multi-select state - tracks which foods are selected
  selectedFoodIds: Set<number> = new Set<number>();  // Uses Set for O(1) lookup

  // MAX limit constant
  private readonly MAX_LIMIT = 300;

  isLoading = false;
  displayedColumns: string[] = ['label', 'value', 'unit'];
  showingAllNutrients = false;
  // Display is always per-serving; 100g is an internal DB normalization detail.
  showPerServing = true;

  // Grams per unit for fixed weight units. Editable units (whole/cup/tbsp/tsp) are user-entered.
  private readonly WEIGHT_UNIT_GRAMS: { [key: string]: number } = {
    g: 1,
    oz: 28.3495,
    lbs: 453.592,
  };

  // Cached nutrient data for the table (recalculated when food or mode changes)
  nutrientTableData: SimplifiedNutrient[] = [];

  // Category grouping for the list display
  groupedFoods: FoodGroup[] = [];

  // Metadata form controls
  shortDescriptionControl = new FormControl<string | null>(null);
  glycemicIndexControl = new FormControl<number | null>(null);
  glycemicLoadControl = new FormControl<number | null>(null);
  servingSizeControl = new FormControl<number | null>(null);
  servingUnitControl = new FormControl<string | null>(null);
  servingGramsPerUnitControl = new FormControl<number | null>(null);
  isSavingMetadata = false;
  isLoadingCompare = false;
  showFatSecretCompare = false;
  fatSecretCompareData: FatSecretCompareResponse | null = null;

  readonly servingUnitOptions = ['whole', 'cup', 'tbsp', 'tsp', 'oz', 'lbs', 'g'];

  // List assignment state (detail panel)
  foodLists: { name: string; description: string; toolTip?: string; assigned: boolean }[] = [];
  private originalAssignedLists = new Set<string>();  // list handles assigned at load

  // Track original values to detect changes
  private originalMetadata: { shortDescription: string | null; glycemicIndex: number | null; glycemicLoad: number | null; servingSize: number | null; servingUnit: string | null; servingGramsPerUnit: number | null } = {
    shortDescription: null,
    glycemicIndex: null,
    glycemicLoad: null,
    servingSize: null,
    servingUnit: null,
    servingGramsPerUnit: null
  };

  constructor(
    private foodsService: RegiApiService,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.foodsService.getLists().subscribe({
      next: (res) => { this.availableLists = res?.lists ?? []; },
      error: () => { this.availableLists = []; }
    });

    // Auto-fill GramsPerUnit when ServingUnit becomes a fixed-weight unit (g/oz/lbs).
    // Non-weight units (whole/cup/tbsp/tsp) keep whatever value is there for editing.
    this.servingUnitControl.valueChanges.subscribe(unit => {
      if (unit && this.WEIGHT_UNIT_GRAMS[unit] !== undefined) {
        this.servingGramsPerUnitControl.setValue(this.WEIGHT_UNIT_GRAMS[unit]);
      }
    });

    // Recompute nutrient table when any serving input changes.
    this.servingSizeControl.valueChanges.subscribe(() => this.updateNutrientTableData());
    this.servingGramsPerUnitControl.valueChanges.subscribe(() => this.updateNutrientTableData());
  }

  isWeightUnit(unit: string | null): boolean {
    return !!unit && this.WEIGHT_UNIT_GRAMS[unit] !== undefined;
  }

  performSearch() {
    const query = this.searchControl.value?.trim() || '';
    const selectedList = this.listFilterControl.value || 'all';
    const limit = this.limitControl.value ?? 300;

    let searchObservable;
    if (selectedList !== 'all') {
      searchObservable = this.foodsService.getListItems(selectedList);
    } else {
      if (query.length < 2) { return; }
      searchObservable = this.foodsService.searchFoods(query, limit);
    }

    this.isLoading = true;

    searchObservable.subscribe({
      next: (results) => {
        console.log('RAW API RESPONSE:', results);

        // API returns {count: number, foods: array} - extract the foods array
        let foodsArray: Food[] = [];
        if (results && results.foods && Array.isArray(results.foods)) {
          foodsArray = results.foods;
        } else if (Array.isArray(results)) {
          foodsArray = results;
        } else {
          foodsArray = [results];
        }

        // List-items endpoint returns `foodId`; regular search returns `id`.
        // It also returns a FLAT shape (calories/proteinG on the row itself) while
        // the search endpoint returns nested nutritionFacts. Normalize both.
        foodsArray = foodsArray.map((f: any) => {
          const normalized: any = { ...f, id: f.id ?? f.foodId };
          if (!normalized.nutritionFacts && (
              f.calories != null || f.proteinG != null || f.totalFatG != null ||
              f.totalCarbohydrateG != null || f.servingSizeG != null)) {
            normalized.nutritionFacts = {
              foodName: f.description ?? '',
              servingSizeHousehold: f.servingSizeHousehold ?? null,
              servingSizeG: f.servingSizeG ?? null,
              servingsPerContainer: f.servingsPerContainer ?? null,
              calories: f.calories,
              proteinG: f.proteinG,
              totalFatG: f.totalFatG,
              saturatedFatG: f.saturatedFatG,
              transFatG: f.transFatG,
              cholesterolMG: f.cholesterolMG,
              sodiumMG: f.sodiumMG,
              totalCarbohydrateG: f.totalCarbohydrateG,
              dietaryFiberG: f.dietaryFiberG,
              totalSugarsG: f.totalSugarsG,
              addedSugarsG: f.addedSugarsG,
              vitaminDMcg: f.vitaminDMcg,
              calciumMG: f.calciumMG,
              ironMG: f.ironMG,
              potassiumMG: f.potassiumMG,
            };
          }
          return normalized;
        });

        // When a specific list is selected and a query is provided, filter client-side
        if (selectedList !== 'all' && query) {
          const lowerQuery = query.toLowerCase();
          foodsArray = foodsArray.filter((food: Food) =>
            food.description?.toLowerCase().includes(lowerQuery)
          );
        }

        // Cap list results to the Limit value so the "List + Limit" combo behaves
        // the same as "search + Limit": Limit always means max rows shown.
        if (selectedList !== 'all' && limit && foodsArray.length > limit) {
          foodsArray = foodsArray.slice(0, limit);
        }

        this.foods = foodsArray;
        this.buildGroupedFoods();
        console.log('foods array:', this.foods);
        console.log('foods.length:', this.foods.length);

        // Track post-filter count on apply button; Limit field is not overwritten.
        const returnedCount = this.foods.length;
        this.resultCount = returnedCount;

        // Show snackbar with return count
        const message = returnedCount === 0
          ? `No foods found. Count: ${returnedCount}`
          : `Foods returned: ${returnedCount}`;

        this.snackBar.open(message, '✕', {
          duration: 10000,
          horizontalPosition: 'center',
          verticalPosition: 'top',
          panelClass: ['info-snackbar']
        });

        // Auto-select first item
        if (this.foods.length > 0) {
          this.selectedIndex = 0;
          this.selectedFood = this.foods[0];
          console.log('Selected first food:', this.selectedFood?.description);
          this.populateMetadataFields(this.selectedFood);
          this.updateNutrientTableData();
        } else {
          this.selectedFood = null;
          this.selectedIndex = -1;
          this.clearMetadataFields();
          this.nutrientTableData = [];
          console.log('No foods to select');
        }

        this.isLoading = false;
      },
      error: (error: HttpErrorResponse) => {
        this.isLoading = false;
        this.foods = [];
        this.selectedFood = null;
        this.resultCount = null;
        this.handleError(error, 'Failed to search foods');
      }
    });
  }

  // Clear the search field
  clearSearch(): void {
    this.searchControl.setValue('');
  }

  // Predefined category display order (always shown, even if empty)
  private readonly CATEGORY_ORDER = [
    'Protein', 'Fat', 'Dairy', 'Vegetable', 'Carbohydrate',
    'Fruit', 'Processed', 'Beverage', 'Condiment'
  ];

  // Build grouped foods from the flat foods array, preserving flat indices for selection
  private buildGroupedFoods(): void {
    const groupMap = new Map<string, { food: Food; flatIndex: number }[]>();

    // Initialize all predefined categories (ensures they always appear)
    for (const cat of this.CATEGORY_ORDER) {
      groupMap.set(cat, []);
    }

    this.foods.forEach((food, index) => {
      const category = food.categoryName || 'Uncategorized';
      if (!groupMap.has(category)) {
        groupMap.set(category, []);
      }
      groupMap.get(category)!.push({ food, flatIndex: index });
    });

    // Build in predefined order first, then any unexpected categories
    const orderedCategories = [...this.CATEGORY_ORDER];
    for (const key of groupMap.keys()) {
      if (!orderedCategories.includes(key)) {
        orderedCategories.push(key);
      }
    }

    this.groupedFoods = orderedCategories
      .filter(cat => groupMap.has(cat))
      .map(category => ({
        category,
        foods: groupMap.get(category)!,
        collapsed: false
      }));
  }

  // Toggle collapse state for a category group
  toggleCategoryCollapse(group: FoodGroup): void {
    group.collapsed = !group.collapsed;
  }

  // NEW: Handle food selection from list
  onFoodSelected(index: number) {
    if (index >= 0 && index < this.foods.length) {
      this.selectedIndex = index;
      this.selectedFood = this.foods[index];
      console.log('Selected:', this.selectedFood.description);
      this.populateMetadataFields(this.selectedFood);
      this.updateNutrientTableData();
    }
  }

  // Populate metadata fields from selected food
  private populateMetadataFields(food: Food): void {
    this.shortDescriptionControl.setValue(food.shortDescription ?? null);
    this.glycemicIndexControl.setValue(food.glycemicIndex ?? null);
    this.glycemicLoadControl.setValue(food.glycemicLoad ?? null);
    // emitEvent:false so we don't trigger the weight-unit auto-fill on load.
    this.servingUnitControl.setValue(food.servingUnit ?? null, { emitEvent: false });
    this.servingGramsPerUnitControl.setValue(food.servingGramsPerUnit ?? null);

    // Prefer the persisted ServingSize; fall back to derived servingSizeG/gramsPerUnit
    // for older rows that haven't been edited yet.
    let initialSize: number | null = null;
    if (typeof food.servingSize === 'number') {
      initialSize = food.servingSize;
    } else {
      const totalG = food.nutritionFacts?.servingSizeG;
      const gpu = food.servingGramsPerUnit;
      if (totalG && gpu && gpu > 0) {
        initialSize = Math.round((totalG / gpu) * 100) / 100;
      }
    }
    this.servingSizeControl.setValue(initialSize);

    // Store original values for change detection
    this.originalMetadata = {
      shortDescription: food.shortDescription ?? null,
      glycemicIndex: food.glycemicIndex ?? null,
      glycemicLoad: food.glycemicLoad ?? null,
      servingSize: initialSize,
      servingUnit: food.servingUnit ?? null,
      servingGramsPerUnit: food.servingGramsPerUnit ?? null
    };

    this.loadFoodLists(food.id);
  }

  // Clear metadata fields when no food selected
  private clearMetadataFields(): void {
    this.shortDescriptionControl.setValue(null);
    this.glycemicIndexControl.setValue(null);
    this.glycemicLoadControl.setValue(null);
    this.servingSizeControl.setValue(null);
    this.servingUnitControl.setValue(null, { emitEvent: false });
    this.servingGramsPerUnitControl.setValue(null);
    this.originalMetadata = { shortDescription: null, glycemicIndex: null, glycemicLoad: null, servingSize: null, servingUnit: null, servingGramsPerUnit: null };
    this.foodLists = [];
    this.originalAssignedLists.clear();
  }

  private loadFoodLists(foodId: number | undefined): void {
    if (foodId == null) { this.foodLists = []; this.originalAssignedLists.clear(); return; }
    this.foodsService.getLists(foodId, 'usda').subscribe({
      next: (res) => {
        this.foodLists = res?.lists ?? [];
        this.originalAssignedLists = new Set(
          this.foodLists.filter(l => l.assigned).map(l => l.name)
        );
      },
      error: () => { this.foodLists = []; this.originalAssignedLists.clear(); }
    });
  }

  // Local toggle only — nothing persists until Save.
  toggleFoodList(list: { assigned: boolean }, checked: boolean): void {
    list.assigned = checked;
  }

  // True when the current ticks differ from the snapshot taken at load.
  private hasListAssignmentChanges(): boolean {
    const current = new Set(this.foodLists.filter(l => l.assigned).map(l => l.name));
    if (current.size !== this.originalAssignedLists.size) { return true; }
    for (const name of current) {
      if (!this.originalAssignedLists.has(name)) { return true; }
    }
    return false;
  }

  // Check if metadata has been modified
  hasMetadataChanges(): boolean {
    const currentShortDesc = this.shortDescriptionControl.value;
    const currentGI = this.glycemicIndexControl.value;
    const currentLoad = this.glycemicLoadControl.value;

    const currentServingSize = this.servingSizeControl.value;
    const currentServingUnit = this.servingUnitControl.value;
    const currentGramsPerUnit = this.servingGramsPerUnitControl.value;

    return currentShortDesc !== this.originalMetadata.shortDescription ||
           currentGI !== this.originalMetadata.glycemicIndex ||
           currentLoad !== this.originalMetadata.glycemicLoad ||
           currentServingSize !== this.originalMetadata.servingSize ||
           currentServingUnit !== this.originalMetadata.servingUnit ||
           currentGramsPerUnit !== this.originalMetadata.servingGramsPerUnit ||
           this.hasListAssignmentChanges();
  }

  // Save metadata to backend, then upload any staged images
  async saveMetadata(): Promise<void> {
    if (!this.selectedFood?.id) {
      this.snackBar.open('No food selected', 'Close', { duration: 3000 });
      return;
    }

    const hasImages = this.imageUploadComponent?.hasFilesToUpload;

    const update: FoodMetadataUpdate = {};

    // Only include fields that have changed
    const currentShortDesc = this.shortDescriptionControl.value;
    const currentGI = this.glycemicIndexControl.value;
    const currentLoad = this.glycemicLoadControl.value;

    if (currentShortDesc !== this.originalMetadata.shortDescription) {
      // Empty string means set to NULL
      update.shortDescription = currentShortDesc === '' ? null : currentShortDesc;
    }
    if (currentGI !== this.originalMetadata.glycemicIndex) {
      update.glycemicIndex = currentGI;
    }
    if (currentLoad !== this.originalMetadata.glycemicLoad) {
      update.glycemicLoad = currentLoad;
    }
    const currentServingSize = this.servingSizeControl.value;
    const currentServingUnit = this.servingUnitControl.value;
    const currentGramsPerUnit = this.servingGramsPerUnitControl.value;
    if (currentServingSize !== this.originalMetadata.servingSize) {
      update.servingSize = currentServingSize;
    }
    if (currentServingUnit !== this.originalMetadata.servingUnit) {
      update.servingUnit = currentServingUnit === '' ? null : currentServingUnit;
    }
    if (currentGramsPerUnit !== this.originalMetadata.servingGramsPerUnit) {
      update.servingGramsPerUnit = currentGramsPerUnit;
    }

    const hasMetadataChanges = Object.keys(update).length > 0;
    const hasListChanges = this.hasListAssignmentChanges();

    // Check if there's anything to do at all
    if (!hasMetadataChanges && !hasListChanges && !hasImages) {
      this.snackBar.open('No changes to save', 'Close', { duration: 3000 });
      return;
    }

    this.isSavingMetadata = true;

    try {
      // Step 1: Save metadata if changed
      if (hasMetadataChanges) {
        const updatedFood = await this.foodsService.updateFoodMetadata(this.selectedFood.id, update).toPromise();
        if (updatedFood) {
          this.selectedFood = updatedFood;
          const index = this.foods.findIndex(f => f.id === updatedFood.id);
          if (index >= 0) {
            this.foods[index] = updatedFood;
          }
          this.originalMetadata = {
            shortDescription: updatedFood.shortDescription ?? null,
            glycemicIndex: updatedFood.glycemicIndex ?? null,
            glycemicLoad: updatedFood.glycemicLoad ?? null,
            servingSize: updatedFood.servingSize ?? this.servingSizeControl.value,
            servingUnit: updatedFood.servingUnit ?? null,
            servingGramsPerUnit: updatedFood.servingGramsPerUnit ?? null
          };
        }
      }

      // Apply list assignment changes (adds + removes) against the snapshot.
      const foodId = this.selectedFood?.id;
      if (foodId != null && hasListChanges) {
        const adds = this.foodLists
          .filter(l => l.assigned && !this.originalAssignedLists.has(l.name))
          .map(l => this.foodsService.addFoodToList(l.name, foodId, 'usda').toPromise());
        const removes = this.foodLists
          .filter(l => !l.assigned && this.originalAssignedLists.has(l.name))
          .map(l => this.foodsService.removeFoodFromList(l.name, foodId, 'usda').toPromise());
        try {
          await Promise.all([...adds, ...removes]);
          this.originalAssignedLists = new Set(
            this.foodLists.filter(l => l.assigned).map(l => l.name)
          );
        } catch {
          this.loadFoodLists(foodId);
          this.snackBar.open('Some list changes failed to save', 'Close', { duration: 5000 });
        }
      }

      // Step 2: Upload any staged images
      if (hasImages) {
        const imageSuccess = await this.imageUploadComponent.uploadImages();
        if (!imageSuccess) {
          this.snackBar.open(
            hasMetadataChanges ? 'Metadata saved, but image upload failed' : 'Image upload failed',
            'Close', { duration: 5000 }
          );
          return;
        }
      }

      this.snackBar.open(
        hasMetadataChanges && hasImages ? 'Metadata and images saved successfully' :
        hasImages ? 'Images uploaded successfully' : 'Metadata saved successfully',
        'Close', { duration: 3000, horizontalPosition: 'center', verticalPosition: 'top', panelClass: ['info-snackbar'] }
      );

    } catch (error: any) {
      this.handleError(error, 'Failed to save');
    } finally {
      this.isSavingMetadata = false;
    }
  }

  // NEW: Handle keyboard navigation in the list
  onListKeydown(event: KeyboardEvent, foodList: any) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const newIndex = Math.min(this.selectedIndex + 1, this.foods.length - 1);
      if (newIndex !== this.selectedIndex) {
        this.onFoodSelected(newIndex);
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const newIndex = Math.max(this.selectedIndex - 1, 0);
      if (newIndex !== this.selectedIndex) {
        this.onFoodSelected(newIndex);
      }
    }
  }

  // NEW: Truncate description for list display
  truncateDescription(description: string, maxLength: number = 40): string {
    if (!description) return '';
    if (description.length <= maxLength) return description;
    return description.substring(0, maxLength - 3) + '...';
  }

  // Error handler with toast notifications
  private handleError(error: HttpErrorResponse, context: string) {
    let message = '';
    
    if (error.status === 0) {
      message = 'Unable to connect to server. Please check your connection.';
    } else if (error.status === 404) {
      message = 'Food not found. Try a different search term.';
    } else if (error.status === 500) {
      message = 'Server error occurred. Please try again later.';
    } else if (error.status >= 400 && error.status < 500) {
      message = error.error?.message || `Request failed: ${error.statusText}`;
    } else if (error.status >= 500) {
      message = 'Server error. Our team has been notified.';
    } else {
      message = `${context}: ${error.message}`;
    }

    this.showErrorToast(message);
    console.error('API Error:', error);
  }

  // Show error toast with close button
  private showErrorToast(message: string) {
    this.snackBar.open(message, 'Close', {
      duration: 10000,
      horizontalPosition: 'center',
      verticalPosition: 'top',
      panelClass: ['error-snackbar']
    });
  }

  // Work with nutritionFacts structure from API
  // Data from API is stored per 100g. servingSizeMultiplicand converts to per-serving.
  public getNutrients(food: any): SimplifiedNutrient[] {
    if (!food?.nutritionFacts) {
      return [];
    }

    const nf = food.nutritionFacts;
    const nutrients: SimplifiedNutrient[] = [];

    // Per-serving multiplier off the 100g baseline.
    // Preferred: ServingSize × GramsPerUnit (the new editor model).
    // Fallback: nutritionFacts.servingSizeG, then multiplicand.
    const multiplier = this.computePerServingMultiplier(food);

    // Reordered: Protein, Fat, Carbs, Calories
    if (typeof nf.proteinG === 'number') {
      nutrients.push({
        label: 'Protein',
        value: Math.round(nf.proteinG * multiplier * 10) / 10,
        unit: 'g'
      });
    }

    if (typeof nf.totalFatG === 'number') {
      nutrients.push({
        label: 'Fat',
        value: Math.round(nf.totalFatG * multiplier * 10) / 10,
        unit: 'g'
      });
    }

    if (typeof nf.totalCarbohydrateG === 'number') {
      nutrients.push({
        label: 'Carbs',
        value: Math.round(nf.totalCarbohydrateG * multiplier * 10) / 10,
        unit: 'g'
      });
    }

    if (typeof nf.calories === 'number') {
      nutrients.push({
        label: 'Calories',
        value: Math.round(nf.calories * multiplier),
        unit: 'kcal'
      });
    }

    return nutrients;
  }

  showAllNutrients() {
    this.showingAllNutrients = !this.showingAllNutrients;
  }

  // Update the cached nutrient data for the mat-table
  private updateNutrientTableData(): void {
    this.nutrientTableData = [...this.getNutrients(this.selectedFood)];
  }

  // Compute the per-serving multiplier off the 100g-normalized baseline.
  // Priority: live form values (ServingSize × GramsPerUnit) → food.servingSizeG → multiplicand.
  private computePerServingMultiplier(food: any): number {
    const size = this.servingSizeControl?.value;
    const gpu = this.servingGramsPerUnitControl?.value ?? food?.servingGramsPerUnit;
    if (size && gpu && size > 0 && gpu > 0) {
      return (size * gpu) / 100;
    }
    const nf = food?.nutritionFacts;
    if (nf?.servingSizeG && nf.servingSizeG > 0) {
      return nf.servingSizeG / 100;
    }
    if (food?.servingSizeMultiplicand && food.servingSizeMultiplicand !== 1) {
      return food.servingSizeMultiplicand;
    }
    return 1;
  }

  // Footer summary line, e.g. "1 serving = 15g" or "per 100g" when no serving config.
  getServingSummary(): string {
    const size = this.servingSizeControl?.value;
    const unit = this.servingUnitControl?.value;
    const gpu = this.servingGramsPerUnitControl?.value ?? this.selectedFood?.servingGramsPerUnit;
    if (size && unit && gpu && size > 0 && gpu > 0) {
      const totalG = Math.round(size * gpu * 10) / 10;
      return `${size} ${unit} = ${totalG}g`;
    }
    const ssg = this.selectedFood?.nutritionFacts?.servingSizeG;
    if (ssg && ssg > 0) {
      return `serving: ${Math.round(ssg)}g`;
    }
    return 'per 100g';
  }

  // Per-serving nutrient value off a 100g baseline.
  public calculateNutrientValue(value: number): number {
    if (!this.selectedFood) return value;
    const multiplier = this.computePerServingMultiplier(this.selectedFood);
    return Math.round(value * multiplier * 10) / 10;
  }

  // Helper method for URI list component
  hasBrandInfo(food: any): boolean {
    return this.foodsService.hasBrandLinks(food);
  }

  // Image upload event handlers
  onImagesUploaded(response: ImageUploadResponse) {
    console.log('Images uploaded successfully:', response);
    this.refreshCurrentFood();
  }

  onRefreshFood() {
    this.refreshCurrentFood();
  }

  private refreshCurrentFood() {
    const query = this.searchControl.value?.trim();
    if (query && this.selectedFood) {
      this.foodsService.refreshFood(query).subscribe({
        next: (updatedFood) => {
          this.selectedFood = updatedFood;
          console.log('Food data refreshed:', updatedFood);
        },
        error: (error: HttpErrorResponse) => {
          this.handleError(error, 'Failed to refresh food data');
        }
      });
    }
  }

  // Getters for image upload component
  get currentFoodQuery(): string {
    return this.searchControl.value?.trim() || '';
  }

  get existingNutritionImageId(): string | null {
    return null;
  }

  get existingProductImageId(): string | null {
    return null;
  }

  get nutritionFactsStatus(): string | null {
    return this.selectedFood?.nutritionFactsStatus || null;
  }

  // Image URL methods - images are already full URLs from CDN
  public nutritionImageUrl(): string | null {
    return this.selectedFood?.nutritionFactsImage || null;
  }

  public productImageUrl(): string | null {
    return this.selectedFood?.foodImage || null;
  }

  // Helper methods to check if images exist
  hasNutritionImage(): boolean {
    return !!(this.selectedFood?.nutritionFactsImage);
  }

  hasProductImage(): boolean {
    return !!(this.selectedFood?.foodImage);
  }

  hasAnyImages(): boolean {
    return this.hasNutritionImage() || this.hasProductImage();
  }
// Get display Food ID (empty string if multiple selected)
  getDisplayFoodId(): string {
    if (this.selectedFoodIds.size > 1) {
      return '';
    }
    // Handle id and foodId
    const food = this.selectedFood as any;
    const foodId = food?.id ?? food?.foodId;
    return foodId?.toString() || '';
  }

  // ========================================
  // MULTI-SELECT FUNCTIONALITY
  // ========================================

  /**
   * Toggle selection state for a food item
   * @param food - The food object to toggle
   */
  toggleFoodSelection(food: Food): void {
    if (!food || !food.id) {
      console.warn('Cannot select food without valid id:', food);
      return;
    }

    if (this.selectedFoodIds.has(food.id)) {
      this.selectedFoodIds.delete(food.id);
      console.log(`Deselected food ID: ${food.id} - ${food.description}`);
    } else {
      this.selectedFoodIds.add(food.id);
      console.log(`Selected food ID: ${food.id} - ${food.description}`);
    }

    console.log('Currently selected IDs:', Array.from(this.selectedFoodIds));
  }

  /**
   * Check if a food item is currently selected
   * @param food - The food object to check
   * @returns true if the food is selected
   */
  isFoodSelected(food: Food): boolean {
    return food && food.id ? this.selectedFoodIds.has(food.id) : false;
  }

  /**
   * Get the count of selected foods
   * @returns number of selected food items
   */
  getSelectedCount(): number {
    return this.selectedFoodIds.size;
  }

  /**
   * Get array of selected food IDs (ready to send to backend API)
   * @returns Array of numeric food IDs
   */
  getSelectedFoodIds(): number[] {
    return Array.from(this.selectedFoodIds);
  }

  /**
   * Get full food objects for selected items
   * @returns Array of Food objects that are currently selected
   */
  getSelectedFoods(): Food[] {
    return this.foods.filter(food => this.selectedFoodIds.has(food.id));
  }

  /**
   * Clear all selections
   */
  clearAllSelections(): void {
    this.selectedFoodIds.clear();
    console.log('All selections cleared');
  }

  /**
   * Select all foods in the current search results
   */
  selectAllFoods(): void {
    this.foods.forEach(food => {
      if (food.id) {
        this.selectedFoodIds.add(food.id);
      }
    });
    console.log('Selected all foods. Total:', this.selectedFoodIds.size);
  }

  /**
   * EXAMPLE: Send selected food IDs to backend API
   * This demonstrates how you would use the selected IDs in an API call
   */
  submitSelectedFoods(): void {
    const selectedIds = this.getSelectedFoodIds();

    if (selectedIds.length === 0) {
      this.snackBar.open('No foods selected', 'Close', {
        duration: 3000,
        horizontalPosition: 'center',
        verticalPosition: 'top'
      });
      return;
    }

    console.log('Submitting food IDs to backend:', selectedIds);

    // Example API call (uncomment and adjust endpoint as needed):
    /*
    this.http.post(`${this.apiUrl}/user/selected-foods`, {
      foodIds: selectedIds  // Sends array like: [12345, 67890, 11111]
    }).subscribe({
      next: (response) => {
        this.snackBar.open(`Successfully saved ${selectedIds.length} foods`, 'Close', {
          duration: 3000
        });
        this.clearAllSelections();
      },
      error: (error) => {
        this.handleError(error, 'Failed to save selected foods');
      }
    });
    */

    // For now, just show a success message
    this.snackBar.open(`Ready to submit ${selectedIds.length} food IDs: ${selectedIds.join(', ')}`, 'Close', {
      duration: 5000,
      horizontalPosition: 'center',
      verticalPosition: 'top',
      panelClass: ['info-snackbar']
    });
  }

  // ========================================
  // FATSECRET COMPARE / OVERWRITE
  // ========================================

  openFatSecretCompare(): void {
    if (!this.selectedFood?.id) return;

    this.isLoadingCompare = true;
    this.foodsService.compareFatSecret(this.selectedFood.id).subscribe({
      next: (data) => {
        this.fatSecretCompareData = data;
        this.showFatSecretCompare = true;
        this.isLoadingCompare = false;
      },
      error: (error: HttpErrorResponse) => {
        this.isLoadingCompare = false;
        this.handleError(error, 'FatSecret compare failed');
      }
    });
  }

  closeFatSecretCompare(): void {
    this.showFatSecretCompare = false;
    this.fatSecretCompareData = null;
  }

  onFatSecretOverwrite(event: { fatsecretFoodId: string; selectedServingId: string }): void {
    if (!this.selectedFood?.id) return;

    this.foodsService.overwriteFromFatSecret(this.selectedFood.id, event).subscribe({
      next: (updatedFood) => {
        // Update the food in our list and detail view
        this.selectedFood = updatedFood;
        const index = this.foods.findIndex(f => f.id === updatedFood.id);
        if (index >= 0) {
          this.foods[index] = updatedFood;
        }
        this.populateMetadataFields(updatedFood);
        this.updateNutrientTableData();
        this.closeFatSecretCompare();

        this.snackBar.open('Food overwritten from FatSecret successfully', 'Close', {
          duration: 5000,
          horizontalPosition: 'center',
          verticalPosition: 'top',
          panelClass: ['info-snackbar']
        });
      },
      error: (error: HttpErrorResponse) => {
        this.handleError(error, 'FatSecret overwrite failed');
      }
    });
  }
}