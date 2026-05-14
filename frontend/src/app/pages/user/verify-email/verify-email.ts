import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../../services/api-service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './verify-email.html',
  styleUrl: './verify-email.css',
})
export class VerifyEmail implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(ApiService);
  private authService = inject(AuthService);

  status = signal<'loading' | 'success' | 'error'>('loading');
  message = signal<string>('Verificando tu cuenta...');

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      const token = params['token'];
      if (!token) {
        this.status.set('error');
        this.message.set('Enlace de verificación inválido o caducado.');
        return;
      }

      this.api.verifyEmail(token).subscribe({
        next: (res) => {
          this.status.set('success');
          this.message.set(res.message || 'Cuenta verificada correctamente. Iniciando sesión...');
          
          if (res.token) {
            this.authService.login(res.token);
            setTimeout(() => {
              this.router.navigate(['/']);
            }, 2000);
          }
        },
        error: (err) => {
          this.status.set('error');
          this.message.set(err.error?.message || 'Error al verificar la cuenta.');
        }
      });
    });
  }
}
