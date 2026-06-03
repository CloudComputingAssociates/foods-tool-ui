import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AppRoutingModule } from './app-routing.module';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { AuthHttpInterceptor } from '@auth0/auth0-angular';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { environment } from '../environments/environment.prod';
import { FlexLayoutModule } from '@angular/flex-layout';

// Material Imports
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';

import { AppComponent } from './app.component';
import { AuthModule } from '@auth0/auth0-angular'
import { LoginComponent } from './login/login.component';
import { FoodsComponent } from './foods/foods.component';
import { UserFoodsAdminComponent } from './user-foods-admin/user-foods-admin.component';
import { RegiApiService } from './services/regi-api.service';
import { UriListComponent } from './uri-list/uri-list.component';
import { ImageUploadComponent } from './image-upload/image-upload.component';
import { FatsecretCompareComponent } from './fatsecret-compare/fatsecret-compare.component';
import { MealsAdminComponent } from './meals-admin/meals-admin.component';
import { RecipesAdminComponent } from './recipes-admin/recipes-admin.component';
import { CommandWidgetComponent } from './command-widget/command-widget.component';
import { SafePipe } from './pipes/safe.pipe';

@NgModule({
  declarations: [
    AppComponent,
    LoginComponent,
    FoodsComponent,
    UserFoodsAdminComponent,
    ImageUploadComponent,
    FatsecretCompareComponent,
    MealsAdminComponent,
    RecipesAdminComponent,
    CommandWidgetComponent,
    SafePipe
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    HttpClientModule,
    FlexLayoutModule,
    FormsModule,
    ReactiveFormsModule,
    MatInputModule,
    MatFormFieldModule,
    MatCardModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatExpansionModule,
    MatButtonModule,
    MatListModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatIconModule,
    MatCheckboxModule,
    MatSelectModule,
    MatTabsModule,
    UriListComponent,
    AuthModule.forRoot({
      domain: environment.auth0.domain,
      clientId: environment.auth0.clientId,
      authorizationParams: {
        redirect_uri: environment.auth0.redirectUri,
        audience: 'https://api.regimenu.net'
      },
      httpInterceptor: {
        allowedList: [
          'https://api.regimenu.net/api/*'
        ]
      }
    })
  ],
  providers: [
    RegiApiService,
    { provide: HTTP_INTERCEPTORS, useClass: AuthHttpInterceptor, multi: true }
  ],
  bootstrap: [AppComponent],
  exports: [LoginComponent]
})
export class AppModule { }