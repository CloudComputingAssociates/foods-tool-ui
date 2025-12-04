import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormControl } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { YehApiService } from '../services/yeh-api.service';
import { HttpErrorResponse } from '@angular/common/http';
import { Food, FoodMetadataUpdate } from '../models/food.model';

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

@Component({
  selector: 'app-foods',
  templateUrl: './foods.component.html',
  styleUrls: ['./foods.component.scss']
})
export class FoodsComponent implements OnInit {
  searchControl = new FormControl('');
  limitControl = new FormControl(50);  // NEW: Default to 50 results
  yehApprovedControl = new FormControl(false);  // YEH Approved checkbox
  foods: Food[] = [];  // Array of all search results (typed as Food[])
  selectedFood: Food | null = null;  // RENAMED from currentFood
  selectedIndex: number = 0;  // Track selected item for detail view

  // NEW: Multi-select state - tracks which foods are selected
  selectedFoodIds: Set<number> = new Set<number>();  // Uses Set for O(1) lookup

  // MAX limit constant
  private readonly MAX_LIMIT = 200;

  isLoading = false;
  displayedColumns: string[] = ['label', 'value', 'unit'];
  showingAllNutrients = false;
  showPerServing = true;  // Toggle for per-serving vs per-100g (default: per serving, sticky)

  // Cached nutrient data for the table (recalculated when food or mode changes)
  nutrientTableData: SimplifiedNutrient[] = [];

  // Metadata form controls
  shortDescriptionControl = new FormControl<string | null>(null);
  glycemicIndexControl = new FormControl<number | null>(null);
  glycemicLoadControl = new FormControl<number | null>(null);
  isSavingMetadata = false;

  // Track original values to detect changes
  private originalMetadata: { shortDescription: string | null; glycemicIndex: number | null; glycemicLoad: number | null } = {
    shortDescription: null,
    glycemicIndex: null,
    glycemicLoad: null
  };

  constructor(
    private foodsService: YehApiService,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    // Remove automatic API calls on typing
  }

  performSearch() {
    const query = this.searchControl.value?.trim() || '';
    const isYehApproved = this.yehApprovedControl.value;
    const limit = this.limitControl.value ?? 50;

    // For regular search, require at least 2 characters
    // For YEH Approved, allow empty query to get all approved foods
    if (!isYehApproved && query.length < 2) {
      return;
    }

    this.isLoading = true;

    // Choose API based on YEH Approved checkbox
    // YEH Approved uses /api/foods/search/all/yehapproved endpoint
    // Regular search uses /api/foods/search?query=...
    let searchObservable;
    if (isYehApproved) {
      // YEH Approved: get all approved foods, then filter client-side if query provided
      searchObservable = this.foodsService.searchYehApprovedFoods(limit);
    } else {
      searchObservable = this.foodsService.searchFoods(query, limit);
    }

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

        // If YEH Approved is checked and there's a query, filter client-side
        if (isYehApproved && query) {
          const lowerQuery = query.toLowerCase();
          foodsArray = foodsArray.filter((food: Food) =>
            food.description?.toLowerCase().includes(lowerQuery)
          );
        }

        this.foods = foodsArray;
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

  // Handle YEH Approved checkbox change - trigger search if checked with empty query
  onYehApprovedChange(): void {
    // Optional: auto-search when checkbox is checked
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

    // Store original values for change detection
    this.originalMetadata = {
      shortDescription: food.shortDescription ?? null,
      glycemicIndex: food.glycemicIndex ?? null,
      glycemicLoad: food.glycemicLoad ?? null
    };
  }

  // Clear metadata fields when no food selected
  private clearMetadataFields(): void {
    this.shortDescriptionControl.setValue(null);
    this.glycemicIndexControl.setValue(null);
    this.glycemicLoadControl.setValue(null);
    this.originalMetadata = { shortDescription: null, glycemicIndex: null, glycemicLoad: null };
  }

  // Check if metadata has been modified
  hasMetadataChanges(): boolean {
    const currentShortDesc = this.shortDescriptionControl.value;
    const currentGI = this.glycemicIndexControl.value;
    const currentLoad = this.glycemicLoadControl.value;

    return currentShortDesc !== this.originalMetadata.shortDescription ||
           currentGI !== this.originalMetadata.glycemicIndex ||
           currentLoad !== this.originalMetadata.glycemicLoad;
  }

  // Save metadata to backend
  saveMetadata(): void {
    if (!this.selectedFood?.id) {
      this.snackBar.open('No food selected', 'Close', { duration: 3000 });
      return;
    }

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

    // Check if there are any changes to save
    if (Object.keys(update).length === 0) {
      this.snackBar.open('No changes to save', 'Close', { duration: 3000 });
      return;
    }

    this.isSavingMetadata = true;

    this.foodsService.updateFoodMetadata(this.selectedFood.id, update).subscribe({
      next: (updatedFood) => {
        // Update the selected food with response
        this.selectedFood = updatedFood;

        // Update in the foods array too
        const index = this.foods.findIndex(f => f.id === updatedFood.id);
        if (index >= 0) {
          this.foods[index] = updatedFood;
        }

        // Update original values to match saved state
        this.originalMetadata = {
          shortDescription: updatedFood.shortDescription ?? null,
          glycemicIndex: updatedFood.glycemicIndex ?? null,
          glycemicLoad: updatedFood.glycemicLoad ?? null
        };

        this.snackBar.open('Metadata saved successfully', 'Close', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'top',
          panelClass: ['info-snackbar']
        });

        this.isSavingMetadata = false;
      },
      error: (error: HttpErrorResponse) => {
        this.isSavingMetadata = false;
        this.handleError(error, 'Failed to save metadata');
      }
    });
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

    // Data is per 100g. When showing per-serving, multiply by servingSizeMultiplicand.
    // servingSizeMultiplicand = servingSizeG / 100 (e.g., 30g serving = 0.3)
    const multiplier = this.showPerServing ? (food.servingSizeMultiplicand || 1) : 1;

    console.log('getNutrients - showPerServing:', this.showPerServing,
      'multiplier:', multiplier,
      'servingSizeMultiplicand:', food.servingSizeMultiplicand,
      'servingSizeG:', food.nutritionFacts?.servingSizeG,
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
    const multiplier = this.showPerServing ? (this.selectedFood.servingSizeMultiplicand || 1) : 1;
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
}