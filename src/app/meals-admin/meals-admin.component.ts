import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { FormControl } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RegiApiService } from '../services/regi-api.service';
import { ServingUnitsService } from '../services/serving-units.service';
import { Meal, MealItem, MealSummary } from '../models/meal-plan.model';

type PlanSource = 'regi' | 'community-approved' | 'community-candidate' | 'user';

@Component({
  selector: 'app-meals-admin',
  templateUrl: './meals-admin.component.html',
  styleUrls: ['./meals-admin.component.scss']
})
export class MealsAdminComponent implements OnInit {
  // Filter controls
  nameSearchControl = new FormControl('');
  emailSearchControl = new FormControl('');
  communityFilterControl = new FormControl<boolean>(false);
  regiFilterControl = new FormControl<boolean>(false);

  // State
  mealPlans: MealSummary[] = [];
  selectedPlan: Meal | null = null;
  isLoading = false;
  isSaving = false;

  // Detail form controls
  regiApprovedControl = new FormControl<boolean>(false);
  shareCandidateControl = new FormControl<boolean>(false);
  videoLinkControl = new FormControl<string | null>(null);
  recipeLinkControl = new FormControl<string | null>(null);

  // Original values for change detection
  private originalVideoLink: string | null = null;
  private originalRecipeLink: string | null = null;

  // PDF viewer modal
  pdfViewerUrl: SafeResourceUrl | null = null;
  pdfRawUrl: string | null = null;

  // ---- Meal-item serving editor (one item at a time, mirroring the Foods editor) ----
  editingItem: MealItem | null = null;
  itemAmountControl = new FormControl<number | null>(null);       // meal item: quantity
  itemUnitControl = new FormControl<string | null>(null);         // meal item: unit (+ food serving unit)
  itemGramsPerUnitControl = new FormControl<number | null>(null); // food: servingGramsPerUnit
  itemServingSizeControl = new FormControl<number | null>(null);  // food: servingSize

  servingUnitOptions: string[] = [...ServingUnitsService.BASE_SEED];
  readonly ADD_NEW_UNIT = '__add_new_unit__';
  isAddingUnit = false;
  private priorUnit: string | null = null;

  // Closed weight-unit set → grams. Drives grams-per-unit auto-fill + unit conversion.
  private readonly WEIGHT_UNIT_GRAMS: { [key: string]: number } = {
    g: 1, oz: 28.3495, lbs: 453.592, kg: 1000,
  };

  @ViewChild('newUnitInput') newUnitInput?: ElementRef<HTMLInputElement>;

  constructor(
    private apiService: RegiApiService,
    private snackBar: MatSnackBar,
    private sanitizer: DomSanitizer,
    private servingUnits: ServingUnitsService
  ) {}

  ngOnInit(): void {
    this.loadMealPlans();
    // Load the serving-unit vocabulary (falls back to the base seed on failure).
    this.servingUnits.getServingUnits().subscribe(units => {
      this.servingUnitOptions = units;
      this.ensureUnitOption(this.itemUnitControl.value);
    });
  }

  applyFilters(): void {
    this.loadMealPlans();
  }

  loadMealPlans(): void {
    this.isLoading = true;
    this.selectedPlan = null;

    const name = this.nameSearchControl.value?.trim() || undefined;
    const email = this.emailSearchControl.value?.trim() || undefined;
    const community = this.communityFilterControl.value || false;
    const yeh = this.regiFilterControl.value || false;

    this.apiService.getAdminMealPlans({ name, email, community, yeh }).subscribe({
      next: (data: any) => {
        const plans: MealSummary[] = Array.isArray(data) ? data : data?.meals ?? data?.data ?? [];
        plans.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
        this.mealPlans = plans;
        this.isLoading = false;
      },
      error: (err: any) => {
        console.error('Failed to load meal plans:', err);
        this.mealPlans = [];
        this.isLoading = false;
        this.snackBar.open('Failed to load meal plans', 'Dismiss', { duration: 3000 });
      }
    });
  }

  getPlanSource(plan: MealSummary): PlanSource {
    if (plan.isRegiApproved) return 'regi';
    if (plan.shareApproved) return 'community-approved';
    if (plan.shareCandidate) return 'community-candidate';
    return 'user';
  }

  getSourceIcon(plan: MealSummary): string {
    switch (this.getPlanSource(plan)) {
      case 'regi': return 'verified';
      case 'community-approved': return 'check_circle';
      case 'community-candidate': return 'groups';
      default: return 'restaurant';
    }
  }

  getSourceTooltip(plan: MealSummary): string {
    switch (this.getPlanSource(plan)) {
      case 'regi': return 'RegiApproved';
      case 'community-approved': return 'Community approved';
      case 'community-candidate': return 'Community candidate';
      default: return 'User meal';
    }
  }

  selectPlan(plan: MealSummary): void {
    this.apiService.getAdminMealPlan(plan.id).subscribe({
      next: (fullPlan: Meal) => this.setSelected(fullPlan),
      error: () => {
        this.snackBar.open('Failed to load meal detail', 'Dismiss', { duration: 3000 });
      }
    });
  }

  private setSelected(fullPlan: Meal): void {
    this.selectedPlan = { ...fullPlan, items: fullPlan.items ?? [] };
    this.populateFormFields(this.selectedPlan);
  }

  /** Re-fetch the selected meal so per-item macros and meal totals reflect a just-saved change. */
  private reloadSelected(): Promise<void> {
    if (!this.selectedPlan) return Promise.resolve();
    const id = this.selectedPlan.id;
    return new Promise(resolve => {
      this.apiService.getAdminMealPlan(id).subscribe({
        next: (fullPlan: Meal) => { this.setSelected(fullPlan); resolve(); },
        error: () => resolve()
      });
    });
  }

  private populateFormFields(plan: Meal): void {
    this.regiApprovedControl.setValue(plan.isRegiApproved ?? false);
    this.shareCandidateControl.setValue(plan.shareCandidate ?? false);
    this.videoLinkControl.setValue(plan.prepVideoLink ?? null);
    this.recipeLinkControl.setValue(plan.recipeLink ?? null);
    this.originalVideoLink = plan.prepVideoLink ?? null;
    this.originalRecipeLink = plan.recipeLink ?? null;
  }

  // ---- Curation flags: isRegiApproved + shareCandidate via PUT /api/meal/{id} (admin-gated) ----

  get hasFlagChanges(): boolean {
    if (!this.selectedPlan) return false;
    return this.regiApprovedControl.value !== this.selectedPlan.isRegiApproved ||
           this.shareCandidateControl.value !== this.selectedPlan.shareCandidate;
  }

  async saveFlags(): Promise<void> {
    if (!this.selectedPlan || !this.hasFlagChanges) return;
    const update: { isRegiApproved?: boolean; shareCandidate?: boolean } = {};
    if (this.regiApprovedControl.value !== this.selectedPlan.isRegiApproved) {
      update.isRegiApproved = this.regiApprovedControl.value ?? false;
    }
    if (this.shareCandidateControl.value !== this.selectedPlan.shareCandidate) {
      update.shareCandidate = this.shareCandidateControl.value ?? false;
    }

    this.isSaving = true;
    try {
      await this.apiService.updateAdminMealPlan(this.selectedPlan.id, update).toPromise();
      if (update.isRegiApproved !== undefined) this.selectedPlan.isRegiApproved = update.isRegiApproved;
      if (update.shareCandidate !== undefined) this.selectedPlan.shareCandidate = update.shareCandidate;
      this.snackBar.open('Flags saved', 'Dismiss', { duration: 2000 });
      this.loadMealPlans();
    } catch {
      this.snackBar.open('Failed to save flags', 'Dismiss', { duration: 3000 });
    }
    this.isSaving = false;
  }

  // ---- Community approval: shareApproved via PATCH /api/meal/{id}/approve ----

  get communityState(): 'approved' | 'candidate' | 'none' {
    if (!this.selectedPlan) return 'none';
    if (this.selectedPlan.shareApproved) return 'approved';
    if (this.selectedPlan.shareCandidate) return 'candidate';
    return 'none';
  }

  /** Toggle community share approval. The server sets ShareApproved and clears ShareCandidate. */
  async toggleShareApproval(): Promise<void> {
    if (!this.selectedPlan) return;
    const next = !this.selectedPlan.shareApproved;

    if (next) {
      const confirmed = window.confirm(
        'Approve this meal for the community?\n\nConfirm these are reviewed:\n- Meal Image\n- Video Link\n- Recipe Link'
      );
      if (!confirmed) return;
    }

    this.isSaving = true;
    try {
      await this.apiService.setMealPlanShareApproval(this.selectedPlan.id, next).toPromise();
      this.selectedPlan.shareApproved = next;
      if (next) {
        this.selectedPlan.shareCandidate = false;
        this.shareCandidateControl.setValue(false);
      }
      this.snackBar.open(next ? 'Approved for community' : 'Approval revoked', 'Dismiss', { duration: 2000 });
      this.loadMealPlans();
    } catch {
      this.snackBar.open('Failed to update approval', 'Dismiss', { duration: 3000 });
    }
    this.isSaving = false;
  }

  // ---- Links ----

  hasVideoLinkChanges(): boolean {
    return this.videoLinkControl.value !== this.originalVideoLink;
  }

  hasRecipeLinkChanges(): boolean {
    return this.recipeLinkControl.value !== this.originalRecipeLink;
  }

  async saveVideoLink(): Promise<void> {
    if (!this.selectedPlan || !this.hasVideoLinkChanges()) return;
    this.isSaving = true;
    try {
      await this.apiService.updateAdminMealPlan(this.selectedPlan.id, {
        prepVideoLink: this.videoLinkControl.value ?? ''
      }).toPromise();
      this.originalVideoLink = this.videoLinkControl.value;
      this.selectedPlan.prepVideoLink = this.videoLinkControl.value ?? undefined;
      this.snackBar.open('Video link saved', 'Dismiss', { duration: 2000 });
    } catch {
      this.snackBar.open('Failed to save video link', 'Dismiss', { duration: 3000 });
    }
    this.isSaving = false;
  }

  async saveRecipeLink(): Promise<void> {
    if (!this.selectedPlan || !this.hasRecipeLinkChanges()) return;
    this.isSaving = true;
    try {
      await this.apiService.updateAdminMealPlan(this.selectedPlan.id, {
        recipeLink: this.recipeLinkControl.value ?? ''
      }).toPromise();
      this.originalRecipeLink = this.recipeLinkControl.value;
      this.selectedPlan.recipeLink = this.recipeLinkControl.value ?? undefined;
      this.snackBar.open('Recipe link saved', 'Dismiss', { duration: 2000 });
    } catch {
      this.snackBar.open('Failed to save recipe link', 'Dismiss', { duration: 3000 });
    }
    this.isSaving = false;
  }

  // ---- Recipe PDF viewer (render inline instead of triggering a download) ----

  openPdf(url?: string | null): void {
    if (!url) return;
    this.pdfRawUrl = url;
    this.pdfViewerUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  closePdf(): void {
    this.pdfViewerUrl = null;
    this.pdfRawUrl = null;
  }

  // ---- Meal-item serving editor ----

  openItemEditor(item: MealItem): void {
    this.editingItem = item;
    this.isAddingUnit = false;
    this.itemAmountControl.setValue(item.quantity ?? null);
    this.itemUnitControl.setValue(item.unit ?? null);
    this.itemGramsPerUnitControl.setValue(item.food?.servingGramsPerUnit ?? null);
    this.itemServingSizeControl.setValue(item.food?.servingSize ?? null);
    this.priorUnit = item.unit ?? null;
    this.ensureUnitOption(item.unit);
  }

  closeItemEditor(): void {
    this.editingItem = null;
    this.isAddingUnit = false;
  }

  isWeightUnit(unit: string | null): boolean {
    return !!unit && this.WEIGHT_UNIT_GRAMS[unit] !== undefined;
  }

  // Dropdown selection. The sentinel switches the field to a free-type input.
  onUnitSelectionChange(value: string | null): void {
    if (value === this.ADD_NEW_UNIT) {
      this.isAddingUnit = true;
      this.itemUnitControl.setValue(null, { emitEvent: false });
      setTimeout(() => this.newUnitInput?.nativeElement.focus());
      return;
    }
    this.applyUnitChange(value);
  }

  // Commit a free-typed unit (e.g. "slice", "pickle") on blur; blank reverts.
  commitNewUnit(): void {
    this.isAddingUnit = false;
    const typed = (this.itemUnitControl.value ?? '').trim();
    if (!typed) {
      this.itemUnitControl.setValue(this.priorUnit);
      return;
    }
    const existing = this.servingUnitOptions.find(u => u.toLowerCase() === typed.toLowerCase());
    const finalValue = existing ?? typed;
    if (!existing) this.servingUnitOptions = [...this.servingUnitOptions, finalValue];
    this.itemUnitControl.setValue(finalValue);
    this.applyUnitChange(finalValue);
  }

  // Weight units auto-fill grams/unit; then recompute the amount to preserve total grams.
  private applyUnitChange(newUnit: string | null): void {
    if (newUnit && this.WEIGHT_UNIT_GRAMS[newUnit] !== undefined) {
      this.itemGramsPerUnitControl.setValue(this.WEIGHT_UNIT_GRAMS[newUnit]);
    }
    const amount = this.itemAmountControl.value;
    const oldG = this.gramsPerUnitFor(this.priorUnit, this.editingItem?.food?.servingGramsPerUnit ?? null);
    const newG = this.gramsPerUnitFor(newUnit, this.itemGramsPerUnitControl.value);
    if (amount != null && oldG && newG && newG > 0 && this.priorUnit !== newUnit) {
      const converted = (amount * oldG) / newG;
      this.itemAmountControl.setValue(Math.round(converted * 100) / 100);
    }
    this.priorUnit = newUnit;
  }

  // Weight units use the fixed table; named units (whole/cup/slice) use the food's grams/unit.
  private gramsPerUnitFor(unit: string | null, fallback: number | null): number | null {
    if (unit && this.WEIGHT_UNIT_GRAMS[unit] !== undefined) return this.WEIGHT_UNIT_GRAMS[unit];
    return fallback;
  }

  private ensureUnitOption(unit: string | null | undefined): void {
    const trimmed = (unit ?? '').trim();
    if (!trimmed) return;
    if (!this.servingUnitOptions.some(u => u.toLowerCase() === trimmed.toLowerCase())) {
      this.servingUnitOptions = [...this.servingUnitOptions, trimmed];
    }
  }

  async saveItem(): Promise<void> {
    if (!this.selectedPlan || !this.editingItem || this.editingItem.id == null) return;
    const item = this.editingItem;
    const amount = this.itemAmountControl.value;
    const unit = (this.itemUnitControl.value ?? '').trim();
    if (amount == null || amount <= 0) {
      this.snackBar.open('Amount must be greater than 0', 'Dismiss', { duration: 3000 });
      return;
    }
    if (!unit) {
      this.snackBar.open('Unit is required', 'Dismiss', { duration: 3000 });
      return;
    }

    this.isSaving = true;
    try {
      // 1) Meal item: amount + unit (meal-scoped).
      await this.apiService.updateMealItem(this.selectedPlan.id, item.id, { quantity: amount, unit }).toPromise();
      // 2) Food serving definition (grams/unit, serving size, unit) — writes back to the food record.
      const wrote = await this.saveFoodServingDef(item, unit);
      if (wrote === 'cancelled') { this.isSaving = false; return; }

      await this.reloadSelected();
      this.closeItemEditor();
      this.snackBar.open('Item updated', 'Dismiss', { duration: 2000 });
    } catch {
      this.snackBar.open('Failed to update item', 'Dismiss', { duration: 3000 });
    }
    this.isSaving = false;
  }

  /**
   * Persist the food-level serving fields (grams/unit + serving size + unit) when changed.
   * A shared catalog `food` write is confirmed first (global blast radius); a `userfood`
   * write goes straight through the admin endpoint. Returns 'cancelled' if the admin backs out.
   */
  private async saveFoodServingDef(item: MealItem, unit: string): Promise<'wrote' | 'noop' | 'cancelled'> {
    const food = item.food;
    if (!food) return 'noop';

    const gpu = this.itemGramsPerUnitControl.value;
    const size = this.itemServingSizeControl.value;
    const gpuChanged = (gpu ?? null) !== (food.servingGramsPerUnit ?? null);
    const sizeChanged = (size ?? null) !== (food.servingSize ?? null);
    const unitChanged = unit !== (food.servingUnit ?? '');
    if (!gpuChanged && !sizeChanged && !unitChanged) return 'noop';

    const update = { servingUnit: unit, servingGramsPerUnit: gpu, servingSize: size };

    if (food.foodSource === 'food') {
      const ok = window.confirm(
        `"${food.description}" is a shared catalog food.\n\nChanging its serving definition affects EVERY meal and user that uses it. Proceed?`
      );
      if (!ok) return 'cancelled';
      await this.apiService.updateFoodMetadata(food.foodId, update).toPromise();
    } else {
      await this.apiService.updateAdminUserFood(food.foodId, update).toPromise();
    }
    return 'wrote';
  }

  // ---- Item display helpers (MealItem nests the resolved food under `food`) ----

  itemName(item: MealItem): string {
    return item.food?.shortDescription || item.foodName;
  }

  itemThumbnail(item: MealItem): string | null {
    return item.food?.foodImageThumbnail ?? null;
  }

  truncateDescription(desc?: string | null, maxLen = 40): string {
    if (!desc) return '';
    return desc.length > maxLen ? desc.substring(0, maxLen) + '...' : desc;
  }
}
