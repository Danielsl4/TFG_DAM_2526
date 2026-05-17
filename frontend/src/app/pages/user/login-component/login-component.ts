import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { ApiService } from '../../../services/api-service';
import { AuthService } from '../../../services/auth.service';
import Swal from 'sweetalert2';

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
  isLoading = signal<boolean>(false);

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
      this.isLoading.set(true);

      this.api.login(formData).subscribe({
        next: (respuesta) => {
          this.isLoading.set(false);
          // Usar el servicio de autenticación centralizado
          if (respuesta.token) {
            this.authService.login(respuesta.token);
            // Redirigir al home
            this.router.navigate(['/']);
          }
        },
        error: (err) => {
          this.isLoading.set(false);
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
        this.resendLoading.set(false);
        this.showResendButton.set(false);

        if (res.emailSent === false && res.verificationToken) {
          Swal.fire({
            icon: 'warning',
            title: 'Servicio de Correo No Disponible',
            html: `
              <p>No se pudo enviar el correo electrónico de verificación en este momento por problemas técnicos del servidor.</p>
              <p style="font-size: 0.9rem; color: #a0aec0;">No te preocupes: puedes activar tu cuenta inmediatamente pulsando en el botón inferior.</p>
            `,
            confirmButtonText: 'Activar Cuenta Ahora',
            confirmButtonColor: '#2ec4b6',
            allowOutsideClick: false
          }).then((result) => {
            if (result.isConfirmed) {
              this.router.navigate(['/verify-email'], { queryParams: { token: res.verificationToken } });
            }
          });
        } else {
          this.successMessage.set(res.message);
          Swal.fire({
            icon: 'success',
            title: 'Correo Enviado',
            text: res.message,
            confirmButtonColor: 'var(--primario)'
          });
        }
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Error al reenviar el correo.');
        this.resendLoading.set(false);
      }
    });
  }
}
