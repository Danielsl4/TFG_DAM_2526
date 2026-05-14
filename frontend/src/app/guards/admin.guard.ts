import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Guard para proteger rutas exclusivas de administradores.
 * Si el usuario no tiene el rol 'admin', se le redirige a la home.
 */
export const adminGuard: CanActivateFn = () => {
  const router = inject(Router);
  const authService = inject(AuthService);

  if (!authService.isAdmin()) {
    console.warn('Acceso denegado: Se requiere rol de administrador.');
    router.navigate(['/']);
    return false;
  }

  return true;
};
