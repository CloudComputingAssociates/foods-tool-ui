import { Component, OnInit, Input } from '@angular/core';
import { AuthService } from '@auth0/auth0-angular';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {

  public buttonName: string;
 
  constructor(public auth: AuthService) { 
  }

  ngOnInit(): void {
  }

  loginClicked(loggedIn): void {
    if( loggedIn == true) {
      this.auth.logout({ logoutParams: { returnTo: window.location.origin } });
    }
    else { 
      this.auth.loginWithRedirect({
        appState: { target: '/' },
        authorizationParams: {
          prompt: "login",
          screen_hint: "signup"
        }
      });
    }
  }
}
