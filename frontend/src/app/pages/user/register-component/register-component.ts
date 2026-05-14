import { Component, inject, signal } from '@angular/core';
import { FormBuilder, Validators, ValidatorFn, AbstractControl, ValidationErrors, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../../services/api-service';
import { AuthService } from '../../../services/auth.service';

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

      this.api.register(formData).subscribe({
        next: (respuesta) => {
          console.log('Usuario registrado:', respuesta);
          this.successMessage.set(respuesta.message || 'Registro exitoso. Tienes 24 horas para verificar tu cuenta desde el correo que te hemos enviado, de lo contrario la cuenta será eliminada.');
          this.profileForm.reset();
        },
        error: (err) => {
          console.error('Error en el registro', err);
          this.errorMessage.set('Error al registrar. El nombre de usuario o el email ya existe o hay un problema con el servidor.');
        }
      });
    }
  }

}
