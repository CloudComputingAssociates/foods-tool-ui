import { Component, OnInit } from '@angular/core';
import { FormControl } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RegiApiService } from '../services/regi-api.service';
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

  constructor(
    private apiService: RegiApiService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadMealPlans();
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
      next: (fullPlan: Meal) => {
        this.selectedPlan = { ...fullPlan, items: fullPlan.items ?? [] };
        this.populateFormFields(this.selectedPlan);
      },
      error: () => {
        this.snackBar.open('Failed to load meal detail', 'Dismiss', { duration: 3000 });
      }
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
