import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import Swal from 'sweetalert2';
import { AuthService } from '../services/auth.service';

/**
 * Interceptor global para capturar errores HTTP y mostrar notificaciones con SweetAlert2.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      let errorMessage = 'Ha ocurrido un error inesperado';
      let errorTitle = 'Error';

      // 1. Manejo de códigos de estado específicos
      if (error.status === 0) {
        errorTitle = 'Sin conexión';
        errorMessage = 'No se pudo conectar con el servidor. Verifica tu conexión a internet o intenta más tarde.';
      } else if (error.status === 401) {
        const errorCode = error.error?.code;

        if (errorCode === 'INVALID_CREDENTIALS') {
          // Retornar directamente para que solo se muestre el error inline en el formulario
          return throwError(() => error);
        } else {
          errorTitle = 'Sesión expirada';
          errorMessage = 'Tu sesión ha caducado. Por favor, inicia sesión de nuevo.';
          
          // Limpiamos sesión usando el servicio centralizado
          authService.logout();
        }
      } else if (error.status === 403) {
        errorTitle = 'Acceso denegado';
        errorMessage = 'No tienes permisos suficientes para realizar esta acción.';
      } else if (error.status === 404) {
        // Opcional: Podrías no mostrar nada en el 404 si prefieres manejarlo en el componente
        errorTitle = 'No encontrado';
        errorMessage = 'El recurso solicitado no existe.';
      } else if (error.status >= 500) {
        errorTitle = 'Error en el servidor';
        errorMessage = 'El servidor ha encontrado un problema. Inténtalo de nuevo en unos momentos.';
      } else {
        // Usar mensaje personalizado del backend si está disponible
        errorMessage = error.error?.message || error.message || errorMessage;
      }

      // 2. Mostrar la alerta con SweetAlert2 (Tema Oscuro coherente con la app)
      Swal.fire({
        icon: 'error',
        title: errorTitle,
        text: errorMessage,
        background: '#1C1F26',
        color: '#EDEDED',
        confirmButtonColor: '#00AEEF',
        confirmButtonText: 'Aceptar'
      });

      // 3. Propagar el error para que el componente también pueda manejarlo si lo desea
      return throwError(() => error);
    })
  );
};
