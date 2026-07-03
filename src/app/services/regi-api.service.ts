import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Food, FoodMetadataUpdate, FatSecretCompareResponse, FatSecretOverwriteRequest } from '../models/food.model';
import { Widget, Command } from '../models/command-widget.model';

interface NutritionUploadResponse {
  success: boolean;
  cdn_url: string;
  description: string;
  status: string;
}

interface ProductUploadResponse {
  success: boolean;
  cdn_url: string;
  thumbnail_url: string;
  food_id: number;
}

@Injectable({
  providedIn: 'root'
})
export class RegiApiService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  // ========================================
  // FOODS API ENDPOINTS (regi-api)
  // ========================================

  searchFoods(query: string, limit?: number): Observable<any> {
    let url = `${this.baseUrl}/foods/search?query=${encodeURIComponent(query)}`;
    if (limit !== undefined && limit !== null) {
      url += `&limit=${limit}`;
    }
    return this.http.get<any>(url);
  }

  // Get all YEH Approved foods (optionally filtered by query)
  // Uses /api/foods/search/all/yehapproved endpoint
  searchYehApprovedFoods(limit?: number): Observable<any> {
    let url = `${this.baseUrl}/foods/search/all/yehapproved`;
    if (limit !== undefined && limit !== null) {
      url += `?limit=${limit}`;
    }
    return this.http.get<any>(url);
  }

  refreshFood(query: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/foods/search?query=${encodeURIComponent(query)}`);
  }

  hasBrandLinks(food: any): boolean {
    if (!food?.brandInfo) {
      return false;
    }
    const nutritionLinks = food.brandInfo.nutritionSiteCandidates || [];
    const productLinks = food.brandInfo.productImageSiteCandidates || [];
    return nutritionLinks.length > 0 || productLinks.length > 0;
  }

  getImageUrl(objectId: string): string {
    return `${this.baseUrl}/images/${objectId}`;
  }

  // Update food metadata (ShortDescription, GlycemicIndex, GlycemicLoad)
  // Uses PATCH /api/foods/{id}
  updateFoodMetadata(foodId: number, update: FoodMetadataUpdate): Observable<Food> {
    return this.http.patch<Food>(`${this.baseUrl}/foods/${foodId}`, update);
  }

  // Distinct serving-unit vocabulary (RegiApproved foods + base seed), server-normalized.
  // GET /api/foods/serving-units -> { units: string[] }
  getServingUnits(): Observable<{ units: string[] }> {
    return this.http.get<{ units: string[] }>(`${this.baseUrl}/foods/serving-units`);
  }

  // ========================================
  // FOOD LISTS (curated)
  // ========================================

  // All lists. Pass foodId to get an assigned flag per list (for the detail panel).
  getLists(foodId?: number, foodSource: string = 'food'): Observable<any> {
    let url = `${this.baseUrl}/lists`;
    if (foodId != null) {
      url += `?foodId=${foodId}&foodSource=${foodSource}`;
    }
    return this.http.get<any>(url);
  }

  // Items in a list (hydrated foods). Same shape as searchYehApprovedFoods.
  getListItems(name: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/lists/${encodeURIComponent(name)}/items`);
  }

  addFoodToList(name: string, foodId: number, foodSource: string = 'food'): Observable<any> {
    return this.http.post<any>(
      `${this.baseUrl}/lists/${encodeURIComponent(name)}/items`,
      { foodId, foodSource }
    );
  }

  removeFoodFromList(name: string, foodId: number, foodSource: string = 'food'): Observable<any> {
    return this.http.delete<any>(
      `${this.baseUrl}/lists/${encodeURIComponent(name)}/items/${foodId}?source=${foodSource}`
    );
  }

  // ========================================
  // FATSECRET COMPARE / OVERWRITE
  // ========================================

  compareFatSecret(foodId: number): Observable<FatSecretCompareResponse> {
    return this.http.get<FatSecretCompareResponse>(`${this.baseUrl}/foods/${foodId}/fatsecret-compare`);
  }

  overwriteFromFatSecret(foodId: number, req: FatSecretOverwriteRequest): Observable<Food> {
    return this.http.post<Food>(`${this.baseUrl}/foods/${foodId}/fatsecret-overwrite`, req);
  }

  // ========================================
  // IMAGE API ENDPOINTS (regi-api; background processing by regi-image)
  // ========================================

  uploadNutritionImage(
    foodId: number,
    nutritionImage: File,
    options?: {
      ingredientsImage?: File;
    }
  ): Observable<NutritionUploadResponse> {
    const formData = new FormData();
    formData.append('foodId', foodId.toString());
    formData.append('nutritionImage', nutritionImage);

    if (options?.ingredientsImage) {
      formData.append('ingredientsImage', options.ingredientsImage);
    }

    return this.http.post<NutritionUploadResponse>(
      `${this.baseUrl}/image/upload/nutrition`,
      formData
    );
  }

  uploadProductImage(foodId: number, image: File): Observable<ProductUploadResponse> {
    const formData = new FormData();
    formData.append('foodId', foodId.toString());
    formData.append('image', image);

    return this.http.post<ProductUploadResponse>(
      `${this.baseUrl}/image/upload/product`,
      formData
    );
  }

  getImageUrls(description: string, type?: 'product' | 'nutrition'): Observable<any> {
    let url = `${this.baseUrl}/image/url/?description=${encodeURIComponent(description)}`;
    if (type) {
      url += `&type=${type}`;
    }
    return this.http.get<any>(url);
  }

  getImageProcessingStatus(): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/image/status`);
  }

  getImageApiHealth(): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/image/health`);
  }

  // ========================================
  // ADMIN ENDPOINTS
  // ========================================

  searchAdminUsers(name?: string, email?: string): Observable<any> {
    let params = new HttpParams();
    if (name) params = params.set('name', name);
    if (email) params = params.set('email', email);
    return this.http.get<any>(`${this.baseUrl}/admin/users/search`, { params });
  }

  getAdminUserFoods(userId: number): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/admin/userfoods/by-user/${userId}`);
  }

  // Update a user food's metadata (admin partial update, no ownership check)
  updateAdminUserFood(userFoodId: number, update: any): Observable<any> {
    return this.http.patch<any>(`${this.baseUrl}/admin/userfoods/${userFoodId}`, update);
  }

  // Approve or reject a share candidate
  setShareApproval(userFoodId: number, approved: boolean): Observable<any> {
    return this.http.patch<any>(`${this.baseUrl}/userfoods/${userFoodId}/approve`, { approved });
  }

  // Get all share candidates (ShareCandidate=1, pending review)
  getShareCandidates(): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/userfoods/candidates`);
  }

  // Get food categories
  getCategories(): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/foods/categories`);
  }

  // ========================================
  // COMMAND ADMIN: WIDGETS & COMMANDS
  // Whole-collection replace semantics on both POSTs — the server reconciles
  // by absence (anything not in the payload is deleted in the same tx). Callers
  // MUST send the entire array on every save.
  // ========================================

  getWidgets(): Observable<Widget[]> {
    return this.http.get<Widget[]>(`${this.baseUrl}/command/widgets`);
  }

  saveAllWidgets(widgets: Widget[]): Observable<Widget[]> {
    return this.http.post<Widget[]>(`${this.baseUrl}/command/widgets`, widgets);
  }

  deleteWidget(widgetId: number): Observable<any> {
    return this.http.delete<any>(`${this.baseUrl}/command/widgets/${widgetId}`);
  }

  // NOTE: GET /api/command/commands may not yet be implemented server-side.
  // The component treats a 404/empty as an empty catalog and does not crash.
  getCommands(): Observable<Command[]> {
    return this.http.get<Command[]>(`${this.baseUrl}/command/commands`);
  }

  saveAllCommands(cmds: Command[]): Observable<Command[]> {
    return this.http.post<Command[]>(`${this.baseUrl}/command/commands`, cmds);
  }
}
