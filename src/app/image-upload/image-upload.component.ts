import { Component, Input, Output, EventEmitter, OnInit, OnChanges } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { YehApiService } from '../services/yeh-api.service';

interface ImageUploadResponse {
  success: boolean;
  nutritionImageUploaded: boolean;
  productImageUploaded: boolean;
  ingredientsImageUploaded?: boolean;
  nutritionFactsStatus?: string;
  message: string;
  warnings?: string[];
}

@Component({
  selector: 'app-image-upload',
  templateUrl: './image-upload.component.html',
  styleUrls: ['./image-upload.component.scss']
})
export class ImageUploadComponent implements OnInit, OnChanges {
  @Input() foodId: number | null = null;
  @Input() foodDescription: string = '';
  @Input() existingNutritionImageUrl: string | null = null;
  @Input() existingProductImageUrl: string | null = null;
  @Input() nutritionFactsStatus: string | null = null;

  @Output() imagesUploaded = new EventEmitter<ImageUploadResponse>();
  @Output() refreshFood = new EventEmitter<void>();

  private baseUrl = 'https://foodsapi.cloudcomputingassociates.net/api/v1';

  // Upload states
  isUploading = false;
  nutritionImageFile: File | null = null;
  productImageFile: File | null = null;
  ingredientsImageFile: File | null = null;

  // Drag and drop states
  isDraggingNutrition = false;
  isDraggingProduct = false;
  isDraggingIngredients = false;

  // Image preview URLs
  nutritionImagePreview: string | null = null;
  productImagePreview: string | null = null;
  ingredientsImagePreview: string | null = null;

  constructor(
    private foodsService: YehApiService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    this.loadExistingImages();
  }

  ngOnChanges() {
    this.loadExistingImages();
  }

  private loadExistingImages() {
    if (this.existingNutritionImageUrl) {
      this.nutritionImagePreview = this.existingNutritionImageUrl;
    }
    if (this.existingProductImageUrl) {
      this.productImagePreview = this.existingProductImageUrl;
    }
  }

  // Drag and drop handlers for nutrition image
  onNutritionDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDraggingNutrition = true;
  }

  onNutritionDragLeave(event: DragEvent) {
    event.preventDefault();
    this.isDraggingNutrition = false;
  }

  onNutritionDrop(event: DragEvent) {
    event.preventDefault();
    this.isDraggingNutrition = false;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.handleNutritionFile(files[0]);
    }
  }

  // Drag and drop handlers for product image
  onProductDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDraggingProduct = true;
  }

  onProductDragLeave(event: DragEvent) {
    event.preventDefault();
    this.isDraggingProduct = false;
  }

  onProductDrop(event: DragEvent) {
    event.preventDefault();
    this.isDraggingProduct = false;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.handleProductFile(files[0]);
    }
  }

  // Drag and drop handlers for ingredients image
  onIngredientsDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDraggingIngredients = true;
  }

  onIngredientsDragLeave(event: DragEvent) {
    event.preventDefault();
    this.isDraggingIngredients = false;
  }

  onIngredientsDrop(event: DragEvent) {
    event.preventDefault();
    this.isDraggingIngredients = false;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.handleIngredientsFile(files[0]);
    }
  }

  // File input handlers
  onNutritionFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleNutritionFile(input.files[0]);
    }
  }

  onProductFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleProductFile(input.files[0]);
    }
  }

  onIngredientsFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleIngredientsFile(input.files[0]);
    }
  }

  // Clipboard paste handlers
  onNutritionPaste(event: ClipboardEvent) {
    const items = event.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            this.handleNutritionFile(file);
            event.preventDefault();
          }
        }
      }
    }
  }

  onProductPaste(event: ClipboardEvent) {
    const items = event.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            this.handleProductFile(file);
            event.preventDefault();
          }
        }
      }
    }
  }

  onIngredientsPaste(event: ClipboardEvent) {
    const items = event.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            this.handleIngredientsFile(file);
            event.preventDefault();
          }
        }
      }
    }
  }

  // File handling
  private handleNutritionFile(file: File) {
    if (!this.validateFile(file)) return;

    this.nutritionImageFile = file;
    this.createImagePreview(file, 'nutrition');
  }

  private handleProductFile(file: File) {
    if (!this.validateFile(file)) return;

    this.productImageFile = file;
    this.createImagePreview(file, 'product');
  }

  private handleIngredientsFile(file: File) {
    if (!this.validateFile(file)) return;

    this.ingredientsImageFile = file;
    this.createImagePreview(file, 'ingredients');
  }

  private validateFile(file: File): boolean {
    if (!file.type.startsWith('image/')) {
      this.snackBar.open('Please select an image file', 'Close', { duration: 3000 });
      return false;
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      this.snackBar.open('File size must be less than 10MB', 'Close', { duration: 3000 });
      return false;
    }

    return true;
  }

  private createImagePreview(file: File, type: 'nutrition' | 'product' | 'ingredients') {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (type === 'nutrition') {
        this.nutritionImagePreview = result;
      } else if (type === 'product') {
        this.productImagePreview = result;
      } else {
        this.ingredientsImagePreview = result;
      }
    };
    reader.readAsDataURL(file);
  }

  // Remove uploaded files
  removeNutritionImage() {
    this.nutritionImageFile = null;
    this.nutritionImagePreview = this.existingNutritionImageUrl
      ? this.existingNutritionImageUrl
      : null;
  }

  removeProductImage() {
    this.productImageFile = null;
    this.productImagePreview = this.existingProductImageUrl
      ? this.existingProductImageUrl
      : null;
  }

  removeIngredientsImage() {
    this.ingredientsImageFile = null;
    this.ingredientsImagePreview = null;
  }

  // Clear all images (UI only - does not delete from server)
  clearAllImages() {
    this.nutritionImageFile = null;
    this.productImageFile = null;
    this.ingredientsImageFile = null;
    this.nutritionImagePreview = null;
    this.productImagePreview = null;
    this.ingredientsImagePreview = null;
  }

  // Upload images
  async uploadImages() {
    if (!this.nutritionImageFile && !this.productImageFile && !this.ingredientsImageFile) {
      this.snackBar.open('Please select at least one image to upload', 'Close', { duration: 3000 });
      return;
    }

    // All image uploads require foodId (food must already exist)
    if ((this.nutritionImageFile || this.ingredientsImageFile || this.productImageFile) && !this.foodId) {
      this.snackBar.open('No Food ID for image upload', 'Close', { duration: 3000 });
      return;
    }

    this.isUploading = true;

    try {
      let nutritionUploaded = false;
      let productUploaded = false;
      let ingredientsUploaded = false;
      const warnings: string[] = [];

      // Upload nutrition image if present (uses foodId)
      // Ingredients image is uploaded together with nutrition image
      if (this.nutritionImageFile && this.foodId) {
        try {
          const options: { ingredientsImage?: File } = {};
          if (this.ingredientsImageFile) {
            options.ingredientsImage = this.ingredientsImageFile;
          }

          const nutritionResponse = await this.foodsService.uploadNutritionImage(
            this.foodId,
            this.nutritionImageFile,
            options
          ).toPromise();

          if (nutritionResponse?.success) {
            nutritionUploaded = true;
            this.nutritionImageFile = null;
            if (this.ingredientsImageFile) {
              ingredientsUploaded = true;
              this.ingredientsImageFile = null;
              this.ingredientsImagePreview = null;
            }
          }
        } catch (nutritionError: any) {
          console.error('Nutrition image upload error:', nutritionError);
          warnings.push(`Nutrition image: ${nutritionError?.error?.message || nutritionError?.message || 'Upload failed'}`);
        }
      }

      // Upload product image if present (uses foodId)
      if (this.productImageFile && this.foodId) {
        try {
          const productResponse = await this.foodsService.uploadProductImage(
            this.foodId,
            this.productImageFile
          ).toPromise();

          if (productResponse?.success) {
            productUploaded = true;
            this.productImageFile = null;
          }
        } catch (productError: any) {
          console.error('Product image upload error:', productError);
          warnings.push(`Product image: ${productError?.error?.message || productError?.message || 'Upload failed'}`);
        }
      }

      // Build response
      const response: ImageUploadResponse = {
        success: nutritionUploaded || productUploaded || ingredientsUploaded,
        nutritionImageUploaded: nutritionUploaded,
        productImageUploaded: productUploaded,
        ingredientsImageUploaded: ingredientsUploaded,
        message: this.buildUploadMessage(nutritionUploaded, productUploaded, ingredientsUploaded),
        warnings: warnings.length > 0 ? warnings : undefined
      };

      if (response.success) {
        this.snackBar.open(response.message, 'Close', { duration: 5000 });
        this.imagesUploaded.emit(response);
        this.refreshFood.emit();
      } else if (warnings.length > 0) {
        this.snackBar.open(`Upload failed: ${warnings.join('; ')}`, 'Close', { duration: 5000 });
      }

    } catch (error: any) {
      console.error('Upload error:', error);
      const errorMessage = error?.error?.message || error?.message || 'Upload failed. Please try again.';
      this.snackBar.open(`Upload failed: ${errorMessage}`, 'Close', { duration: 5000 });
    } finally {
      this.isUploading = false;
    }
  }

  private buildUploadMessage(nutritionUploaded: boolean, productUploaded: boolean, ingredientsUploaded: boolean = false): string {
    const uploaded: string[] = [];
    if (nutritionUploaded) uploaded.push('Nutrition facts');
    if (ingredientsUploaded) uploaded.push('Ingredients');
    if (productUploaded) uploaded.push('Product');

    if (uploaded.length === 0) {
      return 'No images were uploaded';
    } else if (uploaded.length === 1) {
      return `${uploaded[0]} image uploaded successfully!`;
    } else {
      return `${uploaded.join(', ')} images uploaded successfully!`;
    }
  }

  // Check if there are files ready to upload
  get hasFilesToUpload(): boolean {
    return !!(this.nutritionImageFile || this.productImageFile || this.ingredientsImageFile);
  }

  // Check if there are any images to clear
  get hasImagesToClear(): boolean {
    return !!(this.nutritionImagePreview || this.productImagePreview || this.ingredientsImagePreview);
  }

  // Get processing status display
  get nutritionStatusDisplay(): string {
    switch (this.nutritionFactsStatus) {
      case 'pending': return 'Pending OCR processing...';
      case 'processing': return 'AI is extracting nutrition facts...';
      case 'completed': return 'Nutrition facts extracted';
      case 'error': return 'Processing failed - please try again';
      default: return '';
    }
  }

  get showNutritionStatus(): boolean {
    return !!(this.nutritionFactsStatus && ['pending', 'processing', 'completed', 'error'].includes(this.nutritionFactsStatus));
  }
}
