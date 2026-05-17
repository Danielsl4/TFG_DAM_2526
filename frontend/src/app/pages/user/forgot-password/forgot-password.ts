import { Component, inject, signal } from '@angular/core';
import { FormBuilder, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { ApiService } from '../../../services/api-service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [RouterLink, FormsModule, ReactiveFormsModule],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.css',
})
export class ForgotPassword {
  private fb = inject(FormBuilder);
  private api = inject(ApiService);
  private router = inject(Router);

  errorMessage = signal<string>('');
  successMessage = signal<string>('');
  isLoading = signal<boolean>(false);
  useRecoveryKey = signal<boolean>(false);

  forgotForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]]
  });

  passwordMatchValidator = (control: any) => {
    const password = control.get('newPassword');
    const confirmPassword = control.get('confirmPassword');
    return password && confirmPassword && password.value === confirmPassword.value
      ? null
      : { passwordMismatch: true };
  };

  recoveryForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    recoveryKey: ['', [Validators.required, Validators.pattern(/^REC-[0-9A-F]{8}$/i)]],
    newPassword: ['', [Validators.required, Validators.minLength(5)]],
    confirmPassword: ['', [Validators.required]]
  }, { validators: this.passwordMatchValidator });

  getErrorMessage(): string {
    const control = this.forgotForm.get('email');
    if (control?.hasError('required')) return 'Este campo es obligatorio.';
    if (control?.hasError('email')) return 'Introduce un email válido.';
    return '';
  }

  getRecoveryErrorMessage(controlName: string): string {
    const control = this.recoveryForm.get(controlName);
    if (controlName === 'confirmPassword' && this.recoveryForm.hasError('passwordMismatch')) {
      return 'Las contraseñas no coinciden';
    }
    if (control?.hasError('required')) return 'Este campo es obligatorio.';
    if (control?.hasError('email')) return 'Introduce un email válido.';
    if (control?.hasError('pattern')) return 'Formato incorrecto (Ej: REC-1234ABCD).';
    if (control?.hasError('minlength')) {
      return 'Mínimo 5 caracteres.';
    }
    return '';
  }

  onSubmit() {
    if (this.forgotForm.valid) {
      this.isLoading.set(true);
      this.errorMessage.set('');
      this.successMessage.set('');

      const email = this.forgotForm.getRawValue().email;

      this.api.forgotPassword(email).subscribe({
        next: (res) => {
          this.isLoading.set(false);
          this.successMessage.set(res.message || 'Si el correo está registrado, recibirás un enlace de recuperación.');
          this.forgotForm.reset();
        },
        error: (err) => {
          this.isLoading.set(false);
          this.errorMessage.set(err.error?.message || 'Error al enviar el correo. Inténtalo de nuevo más tarde.');
        }
      });
    }
  }

  onSubmitRecovery() {
    if (this.recoveryForm.valid) {
      this.isLoading.set(true);
      this.errorMessage.set('');
      this.successMessage.set('');

      const data = this.recoveryForm.getRawValue();

      this.api.resetPasswordWithRecoveryKey(data).subscribe({
        next: (res) => {
          this.isLoading.set(false);
          Swal.fire({
            icon: 'success',
            title: '¡Contraseña restablecida!',
            text: res.message || 'Tu contraseña ha sido actualizada con éxito.',
            confirmButtonText: 'Iniciar Sesión',
            confirmButtonColor: '#2ec4b6'
          }).then(() => {
            this.router.navigate(['/login']);
          });
        },
        error: (err) => {
          this.isLoading.set(false);
          this.errorMessage.set(err.error?.message || 'Error al restablecer contraseña. Verifica los datos.');
        }
      });
    }
  }
}
