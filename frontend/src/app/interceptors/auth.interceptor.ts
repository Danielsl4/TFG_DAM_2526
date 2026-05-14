import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Interceptor funcional para inyectar el token JWT automáticamente
 * en todas las peticiones salientes que lo requieran.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = localStorage.getItem('token');

  // Si tenemos un token, clonamos la petición y añadimos el header Authorization
  if (token) {
    const authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
    return next(authReq);
  }

  // Si no hay token, pasamos la petición original
  return next(req);
};
