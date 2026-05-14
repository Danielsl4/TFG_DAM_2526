import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { ApiService } from '../../../services/api-service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-login-component',
  imports: [
    RouterLink,
    ReactiveFormsModule
  ],
  templateUrl: './login-component.html',
  styleUrl: './login-component.css',
})
export class LoginComponent {

  private fb = inject(FormBuilder);
  private api = inject(ApiService);
  private authService = inject(AuthService);
  private router = inject(Router);

  // Signal para mostrar mensajes de error
  errorMessage = signal<string>('');
  successMessage = signal<string>('');
  showResendButton = signal<boolean>(false);
  resendLoading = signal<boolean>(false);

  profileForm = this.fb.nonNullable.group({
    username: ['', [Validators.required, Validators.minLength(5)]],
    password: ['', [Validators.required, Validators.minLength(5)]]
  });

  getErrorMessage(controlName: string): string {
    const control = this.profileForm.get(controlName);

    if (control?.hasError('required')) return 'Este campo es obligatorio.';
    if (control?.hasError('minlength')) {
      const requiredLength = control.errors?.['minlength'].requiredLength;
      return `Mínimo ${requiredLength} caracteres`;
    }

    return '';
  }

  // Función para iniciar sesion el usuario
  onSignIn() {
    if (this.profileForm.valid) {
      const formData = this.profileForm.getRawValue();
      // Limpiar mensajes anteriores
      this.errorMessage.set('');
      this.successMessage.set('');
      this.showResendButton.set(false);

      this.api.login(formData).subscribe({
        next: (respuesta) => {
          console.log('Login exitoso:', respuesta);

          // Usar el servicio de autenticación centralizado
          if (respuesta.token) {
            this.authService.login(respuesta.token);
            // Redirigir al home
            this.router.navigate(['/']);
          }
        },
        error: (err) => {
          console.error('Error en el login', err);
          // Mostrar mensaje de error en el formulario (puede venir del backend, ej. correo no verificado)
          this.errorMessage.set(err.error?.message || 'Error al iniciar sesión. Verifica tus credenciales.');
          
          // Si el error es 403 y tiene la marca de no verificado, mostramos el botón de reenvío
          if (err.status === 403 && err.error?.not_verified) {
            this.showResendButton.set(true);
          }
        }
      });
    }
  }

  onResendVerification() {
    const username = this.profileForm.get('username')?.value;
    if (!username) return;

    this.resendLoading.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    this.api.resendVerification(username).subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.showResendButton.set(false);
        this.resendLoading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Error al reenviar el correo.');
        this.resendLoading.set(false);
      }
    });
  }
}
