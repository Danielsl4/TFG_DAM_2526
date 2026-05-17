import { Component, inject, OnInit, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ApiService } from '../../services/api-service';
import { AuthService } from '../../services/auth.service';
import { SeasonService } from '../../services/season-service';

@Component({
  selector: 'app-statistics',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './statistics.html',
  styleUrl: './statistics.css',
})
export class Statistics implements OnInit {
  private apiService = inject(ApiService);
  private authService = inject(AuthService);
  private seasonService = inject(SeasonService);

  userProfile = signal<any>(null);

  stats = signal<any>(null);
  userRanking = signal<any[]>([]);
  isLoading = signal<boolean>(true);
  error = signal<string | null>(null);
  loading = {
    userRanking: true
  };

  constructor() {
    effect(() => {
      const seasonId = this.seasonService.currentSeasonId();
      if (seasonId !== null) {
        this.fetchStatistics(seasonId);
        this.fetchUserRanking(seasonId);
      }
    });
  }

  ngOnInit(): void {
    if (this.authService.isAuthenticated()) {
      this.fetchUserProfile();
    }
  }

  calculateRanks(list: any[], valueField: string): any[] {
    if (!list) return [];
    let currentRank = 1;
    return list.map((item, index) => {
      if (index > 0 && item[valueField] < list[index - 1][valueField]) {
        currentRank = index + 1;
      }
      return { ...item, displayRank: currentRank };
    });
  }

  fetchStatistics(seasonId?: number): void {
    const id = seasonId ?? this.seasonService.currentSeasonId();
    if (id === null) return;

    this.isLoading.set(true);
    this.apiService.getStatistics(id).subscribe({
      next: (data) => {
        if (data.individualRankings) {
          data.individualRankings.topScorers = this.calculateRanks(data.individualRankings.topScorers, 'value');
          data.individualRankings.topYellowCards = this.calculateRanks(data.individualRankings.topYellowCards, 'value');
          data.individualRankings.topRedCards = this.calculateRanks(data.individualRankings.topRedCards, 'value');
        }
        this.stats.set(data);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error fetching league statistics:', err);
        this.error.set('No se pudieron cargar las estadísticas generales.');
        this.isLoading.set(false);
      }
    });
  }

  fetchUserRanking(seasonId?: number): void {
    const id = seasonId ?? this.seasonService.currentSeasonId();
    this.loading.userRanking = true;
    this.apiService.getUserRanking(id || undefined).subscribe({
      next: (ranking) => {
        this.userRanking.set(this.calculateRanks(ranking, 'points'));
        this.loading.userRanking = false;
      },
      error: () => this.loading.userRanking = false
    });
  }

  fetchUserProfile(): void {
    this.apiService.getUserProfile().subscribe({
      next: (data) => this.userProfile.set(data),
      error: (err) => console.error('Error fetching user profile for ranking highlight:', err)
    });
  }
}
