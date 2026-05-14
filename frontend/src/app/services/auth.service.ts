import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private router = inject(Router);

  // Señales para el estado de autenticación accesible desde toda la app
  public isAuthenticated = signal<boolean>(false);
  public isAdmin = signal<boolean>(false);
  public isReferee = signal<boolean>(false);

  constructor() {
    this.checkToken();
  }

  /**
   * Verifica si hay un token en localStorage al inicializar el servicio.
   */
  private checkToken(): void {
    const token = localStorage.getItem('token');
    if (token) {
      this.updateAuthState(token);
    }
  }

  /**
   * Registra el token en el almacenamiento y actualiza las señales.
   * @param token JWT recibido del backend.
   */
  login(token: string): void {
    localStorage.setItem('token', token);
    this.updateAuthState(token);
  }

  /**
   * Limpia la sesión, resetea señales y redirige al login.
   */
  logout(): void {
    localStorage.removeItem('token');
    this.isAuthenticated.set(false);
    this.isAdmin.set(false);
    this.isReferee.set(false);
    this.router.navigate(['/login']);
  }

  /**
   * Decodifica el payload del JWT para extraer roles y actualizar el estado global.
   * @param token JWT a decodificar.
   */
  private updateAuthState(token: string): void {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      
      this.isAuthenticated.set(true);
      this.isAdmin.set(payload.role === 'admin');
      this.isReferee.set(payload.role === 'referee');
    } catch (e) {
      console.error('Error decodificando el token:', e);
      this.logout();
    }
  }
}
