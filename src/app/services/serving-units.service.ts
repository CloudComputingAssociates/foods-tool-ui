import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { RegiApiService } from './regi-api.service';

/**
 * Supplies the Serving Unit vocabulary shown in the food editors.
 *
 * The list is fetched from GET /api/foods/serving-units (distinct units off
 * RegiApproved foods + a base seed). If that endpoint is unavailable we fall
 * back to BASE_SEED so the editor still works. The result only feeds option
 * NAMES — weight-unit semantics (isWeightUnit / grams auto-fill) stay hardcoded
 * in the components against a closed set.
 */
@Injectable({ providedIn: 'root' })
export class ServingUnitsService {
  private api = inject(RegiApiService);

  // Base seed — also the graceful fallback when the endpoint is unavailable.
  static readonly BASE_SEED: readonly string[] = ['whole', 'cup', 'tbsp', 'tsp', 'oz', 'lbs', 'g'];

  getServingUnits(): Observable<string[]> {
    return this.api.getServingUnits().pipe(
      map(res => this.normalize(res?.units)),
      catchError(() => of(this.seed()))
    );
  }

  /** A fresh mutable copy of the base seed. */
  seed(): string[] {
    return [...ServingUnitsService.BASE_SEED];
  }

  // Trim, drop blanks, dedupe case-insensitively (first spelling wins), preserve order.
  // Falls back to the seed if the payload is empty/unusable.
  private normalize(units: unknown): string[] {
    if (!Array.isArray(units)) {
      return this.seed();
    }
    const seen = new Set<string>();
    const out: string[] = [];
    for (const u of units) {
      if (typeof u !== 'string') { continue; }
      const trimmed = u.trim();
      if (!trimmed) { continue; }
      const key = trimmed.toLowerCase();
      if (seen.has(key)) { continue; }
      seen.add(key);
      out.push(trimmed);
    }
    return out.length ? out : this.seed();
  }
}
