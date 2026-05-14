import { Component, inject, signal } from '@angular/core';
import { FormBuilder, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../../services/api-service';

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

  errorMessage = signal<string>('');
  successMessage = signal<string>('');
  isLoading = signal<boolean>(false);

  forgotForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]]
  });

  getErrorMessage(): string {
    const control = this.forgotForm.get('email');
    if (control?.hasError('required')) return 'Este campo es obligatorio.';
    if (control?.hasError('email')) return 'Introduce un email válido.';
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
}
