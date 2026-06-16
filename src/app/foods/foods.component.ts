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
  limitControl = new FormControl(50);  // NEW: Default to 50 results
  listFilterControl = new FormControl<string>('all');  // 'all' or a list handle
  availableLists: { name: string; description: string; toolTip?: string }[] = [];
  foods: Food[] = [];  // Array of all search results (typed as Food[])
  selectedFood: Food | null = null;  // RENAMED from currentFood
  selectedIndex: number = 0;  // Track selected item for detail view

  // NEW: Multi-select state - tracks which foods are selected
  selectedFoodIds: Set<number> = new Set<number>();  // Uses Set for O(1) lookup

  // MAX limit constant
  private readonly MAX_LIMIT = 300;

  isLoading = false;
  displayedColumns: string[] = ['label', 'value', 'unit'];
  showingAllNutrients = false;
  showPerServing = true;  // Toggle for per-serving vs per-100g (default: per serving, sticky)

  // Cached nutrient data for the table (recalculated when food or mode changes)
  nutrientTableData: SimplifiedNutrient[] = [];

  // Category grouping for the list display
  groupedFoods: FoodGroup[] = [];

  // Metadata form controls
  shortDescriptionControl = new FormControl<string | null>(null);
  glycemicIndexControl = new FormControl<number | null>(null);
  glycemicLoadControl = new FormControl<number | null>(null);
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
  private originalMetadata: { shortDescription: string | null; glycemicIndex: number | null; glycemicLoad: number | null; servingUnit: string | null; servingGramsPerUnit: number | null } = {
    shortDescription: null,
    glycemicIndex: null,
    glycemicLoad: null,
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
  }

  performSearch() {
    const query = this.searchControl.value?.trim() || '';
    const selectedList = this.listFilterControl.value || 'all';
    const limit = this.limitControl.value ?? 50;

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
        // Normalize so the rest of the component can always read `food.id`.
        foodsArray = foodsArray.map((f: any) => ({ ...f, id: f.id ?? f.foodId }));

        // When a specific list is selected and a query is provided, filter client-side
        if (selectedList !== 'all' && query) {
          const lowerQuery = query.toLowerCase();
          foodsArray = foodsArray.filter((food: Food) =>
            food.description?.toLowerCase().includes(lowerQuery)
          );
        }

        this.foods = foodsArray;
        this.buildGroupedFoods();
        console.log('foods array:', this.foods);
        console.log('foods.length:', this.foods.length);

        // Update Result Count to match returned/filtered count
        const returnedCount = this.foods.length;
        this.limitControl.setValue(returnedCount);

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
        this.handleError(error, 'Failed to search foods');
      }
    });
  }

  // Set MAX limit
  setMaxLimit(): void {
    this.limitControl.setValue(this.MAX_LIMIT);
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
    this.servingUnitControl.setValue(food.servingUnit ?? null);
    this.servingGramsPerUnitControl.setValue(food.servingGramsPerUnit ?? null);

    // Store original values for change detection
    this.originalMetadata = {
      shortDescription: food.shortDescription ?? null,
      glycemicIndex: food.glycemicIndex ?? null,
      glycemicLoad: food.glycemicLoad ?? null,
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
    this.servingUnitControl.setValue(null);
    this.servingGramsPerUnitControl.setValue(null);
    this.originalMetadata = { shortDescription: null, glycemicIndex: null, glycemicLoad: null, servingUnit: null, servingGramsPerUnit: null };
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

    const currentServingUnit = this.servingUnitControl.value;
    const currentGramsPerUnit = this.servingGramsPerUnitControl.value;

    return currentShortDesc !== this.originalMetadata.shortDescription ||
           currentGI !== this.originalMetadata.glycemicIndex ||
           currentLoad !== this.originalMetadata.glycemicLoad ||
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
    const currentServingUnit = this.servingUnitControl.value;
    const currentGramsPerUnit = this.servingGramsPerUnitControl.value;
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

    // Data is per 100g. When showing per-serving, multiply by servingSizeG/100.
    // Calculate multiplier from servingSizeG if available, otherwise use servingSizeMultiplicand
    let multiplier = 1;
    if (this.showPerServing) {
      if (nf.servingSizeG && nf.servingSizeG > 0) {
        multiplier = nf.servingSizeG / 100;
      } else if (food.servingSizeMultiplicand && food.servingSizeMultiplicand !== 1) {
        multiplier = food.servingSizeMultiplicand;
      }
    }

    console.log('getNutrients - showPerServing:', this.showPerServing,
      'multiplier:', multiplier,
      'servingSizeMultiplicand:', food.servingSizeMultiplicand,
      'servingSizeG:', nf.servingSizeG,
      'food.id:', food.id);

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

  // NEW: Toggle between per-serving and per-100g display
  toggleServingMode() {
    this.showPerServing = !this.showPerServing;
    // Recalculate nutrients for the table
    this.updateNutrientTableData();
  }

  // Update the cached nutrient data for the mat-table
  private updateNutrientTableData(): void {
    // Create a new array reference to trigger Angular change detection
    this.nutrientTableData = [...this.getNutrients(this.selectedFood)];
    console.log('updateNutrientTableData called, new data:', this.nutrientTableData);
  }

  // NEW: Get current display unit for footer
  getDisplayUnit(): string {
    if (this.showPerServing && this.selectedFood?.nutritionFacts?.servingSizeG) {
      return `per ${Math.round(this.selectedFood.nutritionFacts.servingSizeG)}g`;
    }
    return 'per 100g';
  }

  // NEW: Get serving count for display
  getServingCount(): string {
    if (!this.selectedFood?.nutritionFacts?.servingSizeG) return '1';
    
    if (this.showPerServing) {
      return '1';
    } else {
      // Per 100g mode: calculate how many servings in 100g
      const servingsIn100g = 100 / this.selectedFood.nutritionFacts.servingSizeG;
      return servingsIn100g.toFixed(1);
    }
  }

  // NEW: Get label for serving count
  getServingLabel(): string {
    return this.showPerServing ? 'serving size:' : 'servings:';
  }

  // NEW: Calculate nutrient value based on display mode
  public calculateNutrientValue(value: number): number {
    if (!this.selectedFood) return value;

    // Use same multiplier logic as getNutrients()
    let multiplier = 1;
    if (this.showPerServing) {
      const nf = this.selectedFood.nutritionFacts;
      if (nf?.servingSizeG && nf.servingSizeG > 0) {
        multiplier = nf.servingSizeG / 100;
      } else if (this.selectedFood.servingSizeMultiplicand && this.selectedFood.servingSizeMultiplicand !== 1) {
        multiplier = this.selectedFood.servingSizeMultiplicand;
      }
    }

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