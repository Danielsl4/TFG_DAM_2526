import { Component, inject, signal } from '@angular/core';
import { FormBuilder, Validators, ValidatorFn, AbstractControl, ValidationErrors, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../../services/api-service';
import { AuthService } from '../../../services/auth.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-register-component',
  templateUrl: './register-component.html',
  styleUrls: ['./register-component.css'],
  imports: [
    RouterLink,
    FormsModule,
    ReactiveFormsModule,
  ]
})
export class RegisterComponent {

  private fb = inject(FormBuilder);
  private api = inject(ApiService);
  private authService = inject(AuthService);
  private router = inject(Router);

  errorMessage = signal<string>('');
  successMessage = signal<string>('');
  isLoading = signal<boolean>(false);

  passwordMatchValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
    const password = control.get('password');
    const confirmPassword = control.get('password_confirmation');

    return password && confirmPassword && password.value === confirmPassword.value
      ? null
      : { passwordMismatch: true };
  };

  profileForm = this.fb.nonNullable.group({
    username: ['', [Validators.required, Validators.minLength(5)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(5)]],
    password_confirmation: ['', [Validators.required]]
  }, { validators: this.passwordMatchValidator });

  getErrorMessage(controlName: string): string {
    const control = this.profileForm.get(controlName);

    if (controlName === 'password_confirmation' && this.profileForm.hasError('passwordMismatch')) {
      return 'Las contraseñas no coinciden';
    }

    if (control?.hasError('required')) return 'Este campo es obligatorio.';
    if (control?.hasError('email')) return 'Introduce un email válido.';
    if (control?.hasError('minlength')) {
      const requiredLength = control.errors?.['minlength'].requiredLength;
      return `Mínimo ${requiredLength} caracteres`;
    }

    return '';
  }

  onRegister() {
    if (this.profileForm.valid) {
      const formData = this.profileForm.getRawValue();
      this.errorMessage.set('');
      this.successMessage.set('');
      this.isLoading.set(true);

      this.api.register(formData).subscribe({
        next: (respuesta) => {
          this.isLoading.set(false);
          this.profileForm.reset();

          if (respuesta.emailSent === false && respuesta.verificationToken) {
            Swal.fire({
              icon: 'warning',
              title: 'Registro completado',
              html: `
                <p>¡Tu cuenta se ha creado con éxito!</p>
                <div style="background-color: rgba(239, 68, 68, 0.1); border-left: 4px solid #ef4444; padding: 12px; margin: 15px 0; text-align: left; border-radius: 4px;">
                  <strong style="color: #ef4444; font-size: 0.9rem;">Servicio de correo temporalmente no disponible</strong>
                  <p style="font-size: 0.85rem; margin: 5px 0 0 0; color: #ededed;">
                    No pudimos enviarte el enlace por correo electrónico, pero no te preocupes: puedes activar tu cuenta inmediatamente pulsando el siguiente botón alternativo.
                  </p>
                </div>
                <div style="background-color: rgba(58, 134, 200, 0.1); border-left: 4px solid #3a86c8; padding: 12px; margin: 15px 0; text-align: left; border-radius: 4px;">
                  <strong style="color: #3a86c8; font-size: 0.9rem;">🔑 Tu Clave de Recuperación de Emergencia:</strong>
                  <p style="font-size: 1.3rem; font-weight: 800; font-family: monospace; letter-spacing: 1px; color: #ffb703; margin: 5px 0 0 0; text-align: center; text-shadow: 0 0 8px rgba(255, 183, 3, 0.2);">
                    ${respuesta.recoveryKey}
                  </p>
                  <p style="font-size: 0.75rem; color: #a0aec0; margin: 5px 0 0 0; text-align: center;">
                    Guarda esta clave. Te servirá para cambiar tu contraseña si alguna vez olvidas tus datos y el correo vuelve a fallar.
                  </p>
                </div>
              `,
              showCancelButton: false,
              confirmButtonText: 'Activar Cuenta Ahora',
              confirmButtonColor: '#2ec4b6',
              allowOutsideClick: false,
              allowEscapeKey: false
            }).then((result) => {
              if (result.isConfirmed) {
                this.router.navigate(['/verify-email'], { queryParams: { token: respuesta.verificationToken } });
              }
            });
          } else {
            this.successMessage.set(respuesta.message || 'Registro exitoso. Tienes 24 horas para verificar tu cuenta desde el correo que te hemos enviado, de lo contrario la cuenta será eliminada.');
            Swal.fire({
              icon: 'success',
              title: '¡Registrado con éxito!',
              html: `
                <p>Por favor, revisa tu bandeja de entrada para verificar tu cuenta y poder iniciar sesión.</p>
                <div style="background-color: rgba(58, 134, 200, 0.1); border-left: 4px solid #3a86c8; padding: 12px; margin: 15px 0; text-align: left; border-radius: 4px;">
                  <strong style="color: #3a86c8; font-size: 0.9rem;">🔑 Tu Clave de Recuperación de Emergencia:</strong>
                  <p style="font-size: 1.3rem; font-weight: 800; font-family: monospace; letter-spacing: 1px; color: #ffb703; margin: 5px 0 0 0; text-align: center; text-shadow: 0 0 8px rgba(255, 183, 3, 0.2);">
                    ${respuesta.recoveryKey}
                  </p>
                  <p style="font-size: 0.75rem; color: #a0aec0; margin: 5px 0 0 0; text-align: center;">
                    Guarda esta clave. Te servirá para cambiar tu contraseña si alguna vez olvidas tus datos y el correo vuelve a fallar.
                  </p>
                </div>
              `,
              confirmButtonText: 'Entendido',
              confirmButtonColor: 'var(--primario)'
            });
          }
        },
        error: (err) => {
          this.isLoading.set(false);
          console.error('Error en el registro', err);
          this.errorMessage.set('Error al registrar. El nombre de usuario o el email ya existe o hay un problema con el servidor.');
        }
      });
    }
  }

}
