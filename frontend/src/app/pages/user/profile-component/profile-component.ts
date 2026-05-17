import { Component, inject, OnInit, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { ApiService } from '../../../services/api-service';
import { SeasonService } from '../../../services/season-service';
import { AuthService } from '../../../services/auth.service';
import { MatchCard } from '../../../components/match-card/match-card';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-profile-component',
  standalone: true,
  imports: [CommonModule, RouterModule, MatchCard],
  templateUrl: './profile-component.html',
  styleUrl: './profile-component.css',
})
export class ProfileComponent implements OnInit {
  private apiService = inject(ApiService);
  private router = inject(Router);
  private seasonService = inject(SeasonService);
  private authService = inject(AuthService);

  userProfile = signal<any>(null);
  personalStats = signal<any>(null);
  isLoading = signal<boolean>(true);
  error = signal<string | null>(null);
  userRanking = signal<any[]>([]);
  loading = {
    personalStats: true
  };

  constructor() {
    effect(() => {
      const seasonId = this.seasonService.currentSeasonId();
      if (seasonId !== null) {
        this.fetchPersonalStats(seasonId);
      }
    });
  }

  ngOnInit(): void {
    this.fetchProfile();
  }

  fetchProfile(): void {
    this.isLoading.set(true);
    this.apiService.getUserProfile().subscribe({
      next: (data) => {
        this.userProfile.set(data);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error fetching profile:', err);
        this.error.set('No se pudo cargar el perfil. Por favor, inténtalo de nuevo.');
        this.isLoading.set(false);
        if (err.status === 403) {
          this.logout();
        }
      }
    });
  }

  fetchPersonalStats(seasonId?: number): void {
    const id = seasonId ?? this.seasonService.currentSeasonId();
    this.loading.personalStats = true;
    this.apiService.getMyPredictorStats(id || undefined).subscribe({
      next: (stats) => {
        this.personalStats.set(stats);
        this.loading.personalStats = false;
      },
      error: () => this.loading.personalStats = false
    });
  }

  logout(): void {
    this.authService.logout();
  }

  deleteAccount(): void {
    const user = this.userProfile();
    if (!user) return;

    Swal.fire({
      title: '¿Eliminar cuenta?',
      text: '¿Estás seguro de que quieres eliminar tu cuenta?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar cuenta',
      confirmButtonColor: '#d33',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        Swal.showLoading();
        this.apiService.deactivateUserAccount(user.user.id).subscribe({
          next: () => {
            Swal.fire('Cuenta eliminada', 'Tu cuenta ha sido eliminada correctamente.', 'success');
            this.logout();
          },
          error: (err) => {
            Swal.fire('Error', err.error.message || 'No se pudo eliminar la cuenta.', 'error');
          }
        });
      }
    });
  }

  copyRecoveryKey(key: string): void {
    navigator.clipboard.writeText(key).then(() => {
      const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 2000,
        timerProgressBar: true,
        background: '#1C1F26',
        color: '#EDEDED'
      });
      Toast.fire({
        icon: 'success',
        title: 'Clave de recuperación copiada'
      });
    }).catch(err => {
      console.error('No se pudo copiar:', err);
      Swal.fire('Clave de Recuperación', key, 'info');
    });
  }

  generateNewRecoveryKey(): void {
    Swal.fire({
      title: '¿Regenerar clave de emergencia?',
      text: 'Esto invalidará tu clave de recuperación anterior. Solo podrás ver la nueva clave una vez.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, generar nueva clave',
      confirmButtonColor: '#2ec4b6',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        Swal.showLoading();
        this.apiService.regenerateRecoveryKey().subscribe({
          next: (res) => {
            Swal.fire({
              icon: 'success',
              title: '¡Nueva Clave Generada!',
              html: `
                <p>Guarda tu nueva clave en un lugar seguro. No podrás volver a verla por motivos de seguridad.</p>
                <div style="background-color: rgba(58, 134, 200, 0.1); border-left: 4px solid #3a86c8; padding: 12px; margin: 15px 0; text-align: left; border-radius: 4px;">
                  <strong style="color: #3a86c8; font-size: 0.9rem;">🔑 Nueva Clave de Emergencia:</strong>
                  <p id="new-key-text" style="font-size: 1.3rem; font-weight: 800; font-family: monospace; letter-spacing: 1px; color: #ffb703; margin: 5px 0 0 0; text-align: center; text-shadow: 0 0 8px rgba(255, 183, 3, 0.2);">
                    ${res.recoveryKey}
                  </p>
                </div>
              `,
              confirmButtonText: 'Copiar y Entendido',
              confirmButtonColor: '#2ec4b6'
            }).then(() => {
              navigator.clipboard.writeText(res.recoveryKey);
              // Forzar recarga del perfil para actualizar el estado visual
              this.fetchProfile();
            });
          },
          error: (err) => {
            Swal.fire('Error', err.error?.message || 'No se pudo regenerar la clave.', 'error');
          }
        });
      }
    });
  }
}
