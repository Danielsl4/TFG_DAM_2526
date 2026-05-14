import { Component, inject, signal, OnInit, effect } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { ApiService } from '../../../services/api-service';
import { SeasonService } from '../../../services/season-service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-player-detail',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './player-detail.html',
  styleUrl: './player-detail.css',
})
export class PlayerDetail implements OnInit {
  private route = inject(ActivatedRoute);
  private apiService = inject(ApiService);
  private seasonService = inject(SeasonService);

  player: any = null;
  isLoading = signal<boolean>(true);
  error = signal<string | null>(null);

  constructor() {
    effect(() => {
      const seasonId = this.seasonService.currentSeasonId();
      const id = this.route.snapshot.paramMap.get('id');
      if (seasonId !== undefined && id) {
        this.fetchPlayerDetails(id, seasonId);
      }
    });
  }

  ngOnInit(): void {
    // Manejado por effect
  }

  fetchPlayerDetails(id: string, seasonId: number | null): void {
    this.isLoading.set(true);
    this.apiService.getPlayerById(id, seasonId || undefined).subscribe({
      next: (data) => {
        this.player = data;
        if (!this.player.id) this.player.id = id;
        if (this.player.birth_date) {
          const birthDate = new Date(this.player.birth_date);
          const today = new Date();
          let age = today.getFullYear() - birthDate.getFullYear();
          const m = today.getMonth() - birthDate.getMonth();
          if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
          }
          this.player.age = age;
        }
        this.isLoading.set(false);
      },
      error: (error) => {
        console.error('Error sacando jugador:', error);
        this.error.set('No se pudo sacar la información del jugador.');
        this.isLoading.set(false);
      }
    });
  }
}
