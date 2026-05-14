import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

// Guard para evitar que usuarios autenticados accedan a login/register
export const noAuthGuard: CanActivateFn = () => {
  const router = inject(Router);
  const authService = inject(AuthService);

  if (authService.isAuthenticated()) {
    router.navigate(['/']);
    return false;
  }
  return true;
};
