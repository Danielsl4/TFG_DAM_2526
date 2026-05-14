import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, Validators, ValidatorFn, AbstractControl, ValidationErrors, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../../services/api-service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [RouterLink, FormsModule, ReactiveFormsModule],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.css',
})
export class ResetPassword implements OnInit {
  private fb = inject(FormBuilder);
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  errorMessage = signal<string>('');
  successMessage = signal<string>('');
  isLoading = signal<boolean>(false);
  token = '';

  passwordMatchValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
    const password = control.get('password');
    const confirmPassword = control.get('password_confirmation');

    return password && confirmPassword && password.value === confirmPassword.value
      ? null
      : { passwordMismatch: true };
  };

  resetForm = this.fb.nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(5)]],
    password_confirmation: ['', [Validators.required]]
  }, { validators: this.passwordMatchValidator });

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.token = params['token'] || '';
      if (!this.token) {
        this.errorMessage.set('Enlace de recuperación inválido o caducado.');
      }
    });
  }

  getErrorMessage(controlName: string): string {
    const control = this.resetForm.get(controlName);

    if (controlName === 'password_confirmation' && this.resetForm.hasError('passwordMismatch')) {
      return 'Las contraseñas no coinciden';
    }

    if (control?.hasError('required')) return 'Este campo es obligatorio.';
    if (control?.hasError('minlength')) {
      const requiredLength = control.errors?.['minlength'].requiredLength;
      return `Mínimo ${requiredLength} caracteres`;
    }

    return '';
  }

  onSubmit() {
    if (this.resetForm.valid && this.token) {
      this.isLoading.set(true);
      this.errorMessage.set('');
      this.successMessage.set('');

      const newPassword = this.resetForm.getRawValue().password;

      this.api.resetPassword(this.token, newPassword).subscribe({
        next: (res) => {
          this.isLoading.set(false);
          this.successMessage.set(res.message || 'Contraseña actualizada correctamente. Redirigiendo al login...');
          this.resetForm.reset();
          setTimeout(() => {
            this.router.navigate(['/login']);
          }, 3000);
        },
        error: (err) => {
          this.isLoading.set(false);
          this.errorMessage.set(err.error?.message || 'Error al restablecer la contraseña.');
        }
      });
    }
  }
}
