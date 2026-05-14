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
}
