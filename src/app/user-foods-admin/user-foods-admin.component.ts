import { Component, ViewChild } from '@angular/core';
import { FormControl } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RegiApiService } from '../services/regi-api.service';
import { AdminUser } from '../models/user.model';
import { ImageUploadComponent } from '../image-upload/image-upload.component';

interface FoodGroup {
  category: string;
  foods: { food: any; flatIndex: number }[];
  collapsed: boolean;
}

interface SimplifiedNutrient {
  label: string;
  value: number;
  unit: string;
}

@Component({
  selector: 'app-user-foods-admin',
  templateUrl: './user-foods-admin.component.html',
  styleUrls: ['./user-foods-admin.component.scss']
})
export class UserFoodsAdminComponent {
  @ViewChild(ImageUploadComponent) imageUploadComponent!: ImageUploadComponent;

  // User search controls
  nameSearchControl = new FormControl('');
  emailSearchControl = new FormControl('');

  // User search results
  userResults: AdminUser[] = [];
  selectedUser: AdminUser | null = null;
  isSearchingUsers = false;

  // Food display
  foods: any[] = [];
  selectedFood: any = null;
  selectedIndex = 0;
  isLoadingFoods = false;
  groupedFoods: FoodGroup[] = [];

  // Nutrient display
  displayedColumns: string[] = ['label', 'value', 'unit'];
  nutrientTableData: SimplifiedNutrient[] = [];
  showingAllNutrients = false;
  showPerServing = true;

  // Filter controls
  communityCandidateFilterControl = new FormControl<boolean>(false);

  // Whether currently showing flat candidate list (no category grouping)
  showingCandidatesFlat = false;

  // Metadata form controls (mirrors Foods tab)
  shortDescriptionControl = new FormControl<string | null>(null);
  glycemicIndexControl = new FormControl<number | null>(null);
  glycemicLoadControl = new FormControl<number | null>(null);
  categoryControl = new FormControl<number | null>(null);
  shareCandidateControl = new FormControl<boolean>(false);
  shareApprovedControl = new FormControl<boolean>(false);
  productPurchaseLinkControl = new FormControl<string | null>(null);
  servingSizeControl = new FormControl<number | null>(null);
  servingUnitControl = new FormControl<string | null>(null);
  servingGramsPerUnitControl = new FormControl<number | null>(null);
  isSavingMetadata = false;

  readonly servingUnitOptions = ['whole', 'cup', 'tbsp', 'tsp', 'oz', 'lbs', 'g'];

  // Category options (loaded from API)
  categoryOptions: { id: number; name: string }[] = [];

  // Track original values for change detection
  private originalMetadata = {
    shortDescription: null as string | null,
    glycemicIndex: null as number | null,
    glycemicLoad: null as number | null,
    categoryId: null as number | null,
    productPurchaseLink: null as string | null,
    shareCandidate: false,
    shareApproved: false,
    servingSize: null as number | null,
    servingUnit: null as string | null,
    servingGramsPerUnit: null as number | null
  };

  // Predefined category display order
  private readonly CATEGORY_ORDER = [
    'Protein', 'Fat', 'Dairy', 'Vegetable', 'Carbohydrate',
    'Fruit', 'Processed', 'Beverage', 'Condiment'
  ];

  constructor(
    private apiService: RegiApiService,
    private snackBar: MatSnackBar
  ) {
    this.apiService.getCategories().subscribe({
      next: (cats) => {
        const list = Array.isArray(cats) ? cats : cats?.categories || [];
        this.categoryOptions = list.map((c: any) => ({ id: c.categoryId || c.id, name: c.categoryName || c.name }));
      }
    });
  }

  // ========================================
  // USER SEARCH
  // ========================================

  applyFilters(): void {
    const name = this.nameSearchControl.value?.trim() || '';
    const email = this.emailSearchControl.value?.trim() || '';
    const communityCandidateOnly = this.communityCandidateFilterControl.value;

    // If only community candidate filter is checked (no name/email), load all candidates
    if (communityCandidateOnly && !name && !email) {
      this.loadShareCandidates();
      return;
    }

    if (!name && !email) {
      this.snackBar.open('Enter a name or email to search, or check Community Candidate', 'Close', { duration: 3000 });
      return;
    }

    // Search users, then optionally filter their foods by shareCandidate
    this.isSearchingUsers = true;
    this.apiService.searchAdminUsers(name || undefined, email || undefined).subscribe({
      next: (result) => {
        this.userResults = result.users || [];
        this.isSearchingUsers = false;
        if (this.userResults.length === 0) {
          this.snackBar.open('No users found', 'Close', { duration: 3000 });
        }
      },
      error: (err) => {
        this.isSearchingUsers = false;
        const msg = err.status === 403 ? 'Admin access required' : 'Search failed';
        this.snackBar.open(msg, 'Close', { duration: 5000 });
      }
    });
  }

  private loadShareCandidates(): void {
    this.isLoadingFoods = true;
    this.selectedUser = null;
    this.userResults = [];
    this.foods = [];
    this.selectedFood = null;
    this.showingCandidatesFlat = true;

    this.apiService.getShareCandidates().subscribe({
      next: (result) => {
        this.foods = result.foods || result || [];
        this.groupedFoods = []; // no grouping for flat candidate list
        this.isLoadingFoods = false;

        this.snackBar.open(`${this.foods.length} community candidates`, 'Close', {
          duration: 3000, horizontalPosition: 'center', verticalPosition: 'top'
        });

        if (this.foods.length > 0) {
          this.selectedIndex = 0;
          this.selectedFood = this.foods[0];
          this.populateMetadataFields(this.selectedFood);
          this.updateNutrientTableData();
        }
      },
      error: () => {
        this.isLoadingFoods = false;
        this.snackBar.open('Failed to load candidates', 'Close', { duration: 5000 });
      }
    });
  }

  selectUser(user: AdminUser): void {
    this.selectedUser = user;
    this.loadUserFoods(user.id);
  }

  private loadUserFoods(userId: number): void {
    this.isLoadingFoods = true;
    this.foods = [];
    this.selectedFood = null;
    this.groupedFoods = [];
    this.showingCandidatesFlat = false;

    this.apiService.getAdminUserFoods(userId).subscribe({
      next: (result) => {
        let foodsArray = result.foods || [];

        // Filter by community candidate if checkbox is checked
        if (this.communityCandidateFilterControl.value) {
          foodsArray = foodsArray.filter((f: any) => f.shareCandidate);
        }

        this.foods = foodsArray;
        this.buildGroupedFoods();
        this.isLoadingFoods = false;

        this.snackBar.open(`${this.foods.length} foods loaded`, 'Close', {
          duration: 3000, horizontalPosition: 'center', verticalPosition: 'top'
        });

        if (this.foods.length > 0) {
          this.selectedIndex = 0;
          this.selectedFood = this.foods[0];
          this.populateMetadataFields(this.selectedFood);
          this.updateNutrientTableData();
        }
      },
      error: () => {
        this.isLoadingFoods = false;
        this.snackBar.open('Failed to load user foods', 'Close', { duration: 5000 });
      }
    });
  }

  // ========================================
  // FOOD LIST GROUPING
  // ========================================

  private buildGroupedFoods(): void {
    const groupMap = new Map<string, { food: any; flatIndex: number }[]>();

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

  toggleCategoryCollapse(group: FoodGroup): void {
    group.collapsed = !group.collapsed;
  }

  // ========================================
  // FOOD SELECTION & METADATA
  // ========================================

  onFoodSelected(index: number): void {
    if (index >= 0 && index < this.foods.length) {
      this.selectedIndex = index;
      this.selectedFood = this.foods[index];
      this.populateMetadataFields(this.selectedFood);
      this.updateNutrientTableData();
    }
  }

  private populateMetadataFields(food: any): void {
    this.shortDescriptionControl.setValue(food.shortDescription ?? null);
    this.glycemicIndexControl.setValue(food.glycemicIndex ?? null);
    this.glycemicLoadControl.setValue(food.glycemicLoad ?? null);
    this.categoryControl.setValue(food.categoryId ?? null);
    this.productPurchaseLinkControl.setValue(food.productPurchaseLink ?? null);
    this.shareCandidateControl.setValue(food.shareCandidate ?? false);
    this.shareApprovedControl.setValue(food.shareApproved ?? false);
    this.servingSizeControl.setValue(food.servingSize ?? null);
    this.servingUnitControl.setValue(food.servingUnit ?? null);
    this.servingGramsPerUnitControl.setValue(food.servingGramsPerUnit ?? null);

    this.originalMetadata = {
      shortDescription: food.shortDescription ?? null,
      glycemicIndex: food.glycemicIndex ?? null,
      glycemicLoad: food.glycemicLoad ?? null,
      categoryId: food.categoryId ?? null,
      productPurchaseLink: food.productPurchaseLink ?? null,
      shareCandidate: food.shareCandidate ?? false,
      shareApproved: food.shareApproved ?? false,
      servingSize: food.servingSize ?? null,
      servingUnit: food.servingUnit ?? null,
      servingGramsPerUnit: food.servingGramsPerUnit ?? null
    };
  }

  openPurchaseLink(): void {
    const url = this.productPurchaseLinkControl.value;
    if (url) {
      const fullUrl = url.startsWith('http') ? url : 'https://' + url;
      window.open(fullUrl, '_blank');
    }
  }

  onShareApprovedChange(): void {
    if (this.shareApprovedControl.value) {
      this.shareCandidateControl.setValue(false);
    }
  }

  hasMetadataChanges(): boolean {
    return this.shortDescriptionControl.value !== this.originalMetadata.shortDescription ||
           this.glycemicIndexControl.value !== this.originalMetadata.glycemicIndex ||
           this.glycemicLoadControl.value !== this.originalMetadata.glycemicLoad ||
           this.categoryControl.value !== this.originalMetadata.categoryId ||
           this.productPurchaseLinkControl.value !== this.originalMetadata.productPurchaseLink ||
           this.shareCandidateControl.value !== this.originalMetadata.shareCandidate ||
           this.shareApprovedControl.value !== this.originalMetadata.shareApproved ||
           this.servingSizeControl.value !== this.originalMetadata.servingSize ||
           this.servingUnitControl.value !== this.originalMetadata.servingUnit ||
           this.servingGramsPerUnitControl.value !== this.originalMetadata.servingGramsPerUnit;
  }

  async saveMetadata(): Promise<void> {
    if (!this.selectedFood?.id) {
      this.snackBar.open('No food selected', 'Close', { duration: 3000 });
      return;
    }

    const hasImages = this.imageUploadComponent?.hasFilesToUpload;

    // Build update payload — only changed fields
    const update: any = {};
    if (this.shortDescriptionControl.value !== this.originalMetadata.shortDescription) {
      update.shortDescription = this.shortDescriptionControl.value === '' ? null : this.shortDescriptionControl.value;
    }
    if (this.glycemicIndexControl.value !== this.originalMetadata.glycemicIndex) {
      update.glycemicIndex = this.glycemicIndexControl.value;
    }
    if (this.glycemicLoadControl.value !== this.originalMetadata.glycemicLoad) {
      update.glycemicLoad = this.glycemicLoadControl.value;
    }
    if (this.servingSizeControl.value !== this.originalMetadata.servingSize) {
      update.servingSize = this.servingSizeControl.value;
    }
    if (this.servingUnitControl.value !== this.originalMetadata.servingUnit) {
      update.servingUnit = this.servingUnitControl.value === '' ? null : this.servingUnitControl.value;
    }
    if (this.servingGramsPerUnitControl.value !== this.originalMetadata.servingGramsPerUnit) {
      update.servingGramsPerUnit = this.servingGramsPerUnitControl.value;
    }

    if (this.categoryControl.value !== this.originalMetadata.categoryId) {
      update.categoryId = this.categoryControl.value;
    }
    if (this.productPurchaseLinkControl.value !== this.originalMetadata.productPurchaseLink) {
      update.productPurchaseLink = this.productPurchaseLinkControl.value === '' ? null : this.productPurchaseLinkControl.value;
    }
    if (this.shareCandidateControl.value !== this.originalMetadata.shareCandidate) {
      update.shareCandidate = this.shareCandidateControl.value;
    }

    // Handle share approval separately via the approve endpoint
    const shareApprovalChanged = this.shareApprovedControl.value !== this.originalMetadata.shareApproved;

    const hasMetadataChanges = Object.keys(update).length > 0 || shareApprovalChanged;

    if (!hasMetadataChanges && !hasImages) {
      this.snackBar.open('No changes to save', 'Close', { duration: 3000 });
      return;
    }

    this.isSavingMetadata = true;

    try {
      // Step 1: Update metadata if changed
      if (Object.keys(update).length > 0) {
        await this.apiService.updateAdminUserFood(this.selectedFood.id, update).toPromise();
      }

      // Step 2: Approve/reject share if changed
      if (shareApprovalChanged) {
        await this.apiService.setShareApproval(this.selectedFood.id, this.shareApprovedControl.value ?? false).toPromise();
        this.selectedFood.shareApproved = this.shareApprovedControl.value;
        if (this.shareApprovedControl.value) {
          this.selectedFood.shareCandidate = false;
        }
      }

      // Step 3: Upload images if staged
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

      // Update original metadata to reflect saved state
      this.originalMetadata = {
        shortDescription: this.shortDescriptionControl.value,
        glycemicIndex: this.glycemicIndexControl.value,
        glycemicLoad: this.glycemicLoadControl.value,
        categoryId: this.categoryControl.value,
        productPurchaseLink: this.productPurchaseLinkControl.value,
        shareCandidate: this.shareCandidateControl.value ?? false,
        shareApproved: this.shareApprovedControl.value ?? false,
        servingSize: this.servingSizeControl.value,
        servingUnit: this.servingUnitControl.value,
        servingGramsPerUnit: this.servingGramsPerUnitControl.value
      };

      this.snackBar.open('Saved successfully', 'Close', {
        duration: 3000, horizontalPosition: 'center', verticalPosition: 'top'
      });

    } catch (error: any) {
      this.snackBar.open('Failed to save: ' + (error.message || 'Unknown error'), 'Close', { duration: 5000 });
    } finally {
      this.isSavingMetadata = false;
    }
  }

  truncateDescription(description: string | undefined | null, maxLength: number = 40): string {
    if (!description) return '';
    if (description.length <= maxLength) return description;
    return description.substring(0, maxLength - 3) + '...';
  }

  onListKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const newIndex = Math.min(this.selectedIndex + 1, this.foods.length - 1);
      if (newIndex !== this.selectedIndex) this.onFoodSelected(newIndex);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const newIndex = Math.max(this.selectedIndex - 1, 0);
      if (newIndex !== this.selectedIndex) this.onFoodSelected(newIndex);
    }
  }

  // ========================================
  // NUTRIENT DISPLAY
  // ========================================

  getNutrients(food: any): SimplifiedNutrient[] {
    if (!food?.nutritionFacts) return [];
    const nf = food.nutritionFacts;
    const nutrients: SimplifiedNutrient[] = [];

    let multiplier = 1;
    if (this.showPerServing && nf.servingSizeG && nf.servingSizeG > 0) {
      multiplier = nf.servingSizeG / 100;
    }

    if (typeof nf.proteinG === 'number')
      nutrients.push({ label: 'Protein', value: Math.round(nf.proteinG * multiplier * 10) / 10, unit: 'g' });
    if (typeof nf.totalFatG === 'number')
      nutrients.push({ label: 'Fat', value: Math.round(nf.totalFatG * multiplier * 10) / 10, unit: 'g' });
    if (typeof nf.totalCarbohydrateG === 'number')
      nutrients.push({ label: 'Carbs', value: Math.round(nf.totalCarbohydrateG * multiplier * 10) / 10, unit: 'g' });
    if (typeof nf.calories === 'number')
      nutrients.push({ label: 'Calories', value: Math.round(nf.calories * multiplier), unit: 'kcal' });

    return nutrients;
  }

  showAllNutrients(): void {
    this.showingAllNutrients = !this.showingAllNutrients;
  }

  toggleServingMode(): void {
    this.showPerServing = !this.showPerServing;
    this.updateNutrientTableData();
  }

  private updateNutrientTableData(): void {
    this.nutrientTableData = [...this.getNutrients(this.selectedFood)];
  }

  calculateNutrientValue(value: number): number {
    if (!this.selectedFood) return value;
    let multiplier = 1;
    if (this.showPerServing) {
      const nf = this.selectedFood.nutritionFacts;
      if (nf?.servingSizeG && nf.servingSizeG > 0) {
        multiplier = nf.servingSizeG / 100;
      }
    }
    return Math.round(value * multiplier * 10) / 10;
  }

  getDisplayUnit(): string {
    if (this.showPerServing && this.selectedFood?.nutritionFacts?.servingSizeG) {
      return `per ${Math.round(this.selectedFood.nutritionFacts.servingSizeG)}g`;
    }
    return 'per 100g';
  }

  getServingCount(): string {
    if (!this.selectedFood?.nutritionFacts?.servingSizeG) return '1';
    if (this.showPerServing) return '1';
    return (100 / this.selectedFood.nutritionFacts.servingSizeG).toFixed(1);
  }

  getServingLabel(): string {
    return this.showPerServing ? 'serving size:' : 'servings:';
  }

  // ========================================
  // IMAGE HELPERS
  // ========================================

  hasNutritionImage(): boolean {
    return !!(this.selectedFood?.nutritionFactsImage);
  }

  hasProductImage(): boolean {
    return !!(this.selectedFood?.foodImage);
  }

  nutritionImageUrl(): string | null {
    return this.selectedFood?.nutritionFactsImage || null;
  }

  productImageUrl(): string | null {
    return this.selectedFood?.foodImage || null;
  }

  get nutritionFactsStatus(): string | null {
    return this.selectedFood?.nutritionFactsStatus || null;
  }

  onImagesUploaded(event: any): void {
    console.log('Images uploaded:', event);
    // Reload the user's foods to get updated image URLs
    if (this.selectedUser) {
      this.loadUserFoods(this.selectedUser.id);
    }
  }

  onRefreshFood(): void {
    if (this.selectedUser) {
      this.loadUserFoods(this.selectedUser.id);
    }
  }
}
