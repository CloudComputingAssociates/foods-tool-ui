import { Component, Input, Output, EventEmitter, OnInit, OnChanges } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { YehApiService } from '../services/yeh-api.service';

interface ImageUploadResponse {
  success: boolean;
  nutritionImageUploaded: boolean;
  productImageUploaded: boolean;
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

  // Drag and drop states
  isDraggingNutrition = false;
  isDraggingProduct = false;

  // Image preview URLs
  nutritionImagePreview: string | null = null;
  productImagePreview: string | null = null;

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

  private createImagePreview(file: File, type: 'nutrition' | 'product') {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (type === 'nutrition') {
        this.nutritionImagePreview = result;
      } else {
        this.productImagePreview = result;
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

  // Clear all images (UI only - does not delete from server)
  clearAllImages() {
    this.nutritionImageFile = null;
    this.productImageFile = null;
    this.nutritionImagePreview = null;
    this.productImagePreview = null;
  }

  // Upload images
  async uploadImages() {
    if (!this.nutritionImageFile && !this.productImageFile) {
      this.snackBar.open('Please select at least one image to upload', 'Close', { duration: 3000 });
      return;
    }

    if (!this.foodDescription) {
      this.snackBar.open('No food selected for image upload', 'Close', { duration: 3000 });
      return;
    }

    this.isUploading = true;

    try {
      const formData = new FormData();

      if (this.nutritionImageFile) {
        formData.append('nutritionFactsImage', this.nutritionImageFile);
      }

      if (this.productImageFile) {
        formData.append('foodImage', this.productImageFile);
      }

      const response = await this.foodsService.uploadImages(this.foodDescription, formData).toPromise();

      if (response) {
        this.snackBar.open(response.message || 'Images uploaded successfully!', 'Close', {
          duration: 5000
        });

        this.nutritionImageFile = null;
        this.productImageFile = null;

        this.imagesUploaded.emit(response);
        this.refreshFood.emit();
      }

    } catch (error: any) {
      console.error('Upload error:', error);
      const errorMessage = error?.error?.message || error?.message || 'Upload failed. Please try again.';

      this.snackBar.open(`Upload failed: ${errorMessage}`, 'Close', { duration: 5000 });
    } finally {
      this.isUploading = false;
    }
  }

  // Check if there are files ready to upload
  get hasFilesToUpload(): boolean {
    return !!(this.nutritionImageFile || this.productImageFile);
  }

  // Check if there are any images to clear
  get hasImagesToClear(): boolean {
    return !!(this.nutritionImagePreview || this.productImagePreview);
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
