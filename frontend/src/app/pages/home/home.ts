import { Component, OnInit, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ApiService } from '../../services/api-service';
import { SeasonService } from '../../services/season-service';
import { Match } from '../../models/match.model';
import { MatchCard } from '../../components/match-card/match-card';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule, MatchCard],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnInit {
  private apiService = inject(ApiService);
  private seasonService = inject(SeasonService);

  allActiveMatches: Match[] = [];
  standings: any[] = [];
  topScorers: any[] = [];
  userRanking: any[] = [];
  loading = {
    matches: true,
    standings: true,
    statistics: true,
    userRanking: true
  };

  constructor() {
    // Reaccionar a cambios de temporada global
    effect(() => {
      const seasonId = this.seasonService.currentSeasonId();
      if (seasonId !== undefined) {
        this.refreshData(seasonId);
      }
    });
  }

  ngOnInit(): void {
  }

  refreshData(seasonId: number | null): void {
    this.loading.matches = true;
    this.loading.standings = true;
    this.loading.statistics = true;
    
    this.fetchMatches(seasonId);
    this.fetchStandings(seasonId);
    this.fetchStatistics(seasonId);
    this.fetchUserRanking(seasonId);
  }

  get liveMatches(): Match[] {
    return this.allActiveMatches.filter(m => m.status === 'en_curso');
  }

  get upcomingMatches(): Match[] {
    return this.allActiveMatches.filter(m => m.status === 'pendiente').slice(0, 10);
  }

  scrollLive(direction: number): void {
    const grid = document.getElementById('liveGrid');
    if (grid) {
      const scrollAmount = grid.clientWidth;
      grid.scrollBy({ left: direction * scrollAmount, behavior: 'smooth' });
    }
  }

  fetchMatches(seasonId: number | null): void {
    this.apiService.getMatches(seasonId || undefined).subscribe({
      next: (matches) => {
        // Filtrar los finalizados para quedarnos con todos los activos (pendientes y en curso)
        this.allActiveMatches = matches.filter(m => m.status !== 'finalizado');

        // Si no hay partidos activos, mostramos los últimos finalizados como fallback
        if (this.allActiveMatches.length === 0 && matches.length > 0) {
          this.allActiveMatches = matches.slice(-5);
        }
        this.loading.matches = false;
      },
      error: () => this.loading.matches = false
    });
  }

  get hasLiveMatches(): boolean {
    return this.allActiveMatches.some(m => m.status === 'en_curso');
  }

  fetchStandings(seasonId: number | null): void {
    this.apiService.getStandings(seasonId || undefined).subscribe({
      next: (standings) => {
        if (standings.groups) {
          const leaders: any[] = [];
          const groupNames = Object.keys(standings.groups).sort();

          groupNames.forEach(groupName => {
            const teamsInGroup = standings.groups[groupName];
            if (teamsInGroup && teamsInGroup.length > 0) {
              leaders.push({
                ...teamsInGroup[0],
                groupName: groupName
              });
            }
          });
          this.standings = leaders;
        } else if (Array.isArray(standings)) {
          this.standings = standings.slice(0, 5);
        }
        this.loading.standings = false;
      },
      error: () => this.loading.standings = false
    });
  }

  fetchStatistics(seasonId: number | null): void {
    this.apiService.getStatistics(seasonId || undefined).subscribe({
      next: (stats) => {
        if (stats.individualRankings?.topScorers) {
          this.topScorers = stats.individualRankings.topScorers.slice(0, 5);
        } else if (stats.topScorers) {
          this.topScorers = stats.topScorers.slice(0, 5);
        }
        this.loading.statistics = false;
      },
      error: () => this.loading.statistics = false
    });
  }

  fetchUserRanking(seasonId: number | null): void {
    this.loading.userRanking = true;
    this.apiService.getUserRanking(seasonId || undefined).subscribe({
      next: (ranking) => {
        this.userRanking = ranking.slice(0, 5);
        this.loading.userRanking = false;
      },
      error: () => this.loading.userRanking = false
    });
  }
}
