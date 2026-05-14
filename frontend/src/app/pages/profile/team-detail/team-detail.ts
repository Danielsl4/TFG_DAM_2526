import { Component, inject, OnInit, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { ApiService } from '../../../services/api-service';
import { SeasonService } from '../../../services/season-service';
import { MatchCard } from '../../../components/match-card/match-card';
import { StandingsTable } from "../../../components/standings-table/standings-table";

@Component({
  selector: 'app-team-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, MatchCard, StandingsTable],
  templateUrl: './team-detail.html',
  styleUrl: './team-detail.css',
})
export class TeamDetail implements OnInit {
  private route = inject(ActivatedRoute);
  private apiService = inject(ApiService);
  private seasonService = inject(SeasonService);

  team: any = null;
  isLoading = signal<boolean>(true);
  error = signal<string | null>(null);
  bestFourthId = signal<number | null>(null);
  groupStandings = signal<any[]>([]);
  groupName = signal<string | null>(null);

  // Follow Team Logic
  isLogged = signal<boolean>(false);
  isFollowing = signal<boolean>(false);
  isProcessingFollow = signal<boolean>(false);

  constructor() {
    effect(() => {
      const seasonId = this.seasonService.currentSeasonId();
      const id = this.route.snapshot.paramMap.get('id');
      if (seasonId !== undefined && id) {
        this.sacarTeamDetails(id, seasonId);
      }
    });
  }

  ngOnInit(): void {
    this.isLogged.set(!!localStorage.getItem('token'));
  }

  toggleFollow(): void {
    if (!this.isLogged() || this.isProcessingFollow()) return;
    this.isProcessingFollow.set(true);
    this.apiService.toggleFollowTeam(this.team.id).subscribe({
      next: (res) => {
        this.isFollowing.set(res.isFollowing);
        this.isProcessingFollow.set(false);
      },
      error: (err) => {
        console.error('Error toggling follow:', err);
        this.isProcessingFollow.set(false);
      }
    });
  }

  sacarTeamDetails(id: string, seasonId: number | null): void {
    this.isLoading.set(true);
    this.apiService.getTeamById(id, seasonId || undefined).subscribe({
      next: (data) => {
        this.team = data;
        this.isFollowing.set(this.team.isFollowing || false);
        if (!this.team.id) this.team.id = id;

        // Process matches and other stats...
        if (this.team.matches) {
          const finished = this.team.matches.filter((m: any) => m.status === 'finalizado');
          this.team.recentMatches = [...finished].reverse().slice(0, 3);
        }

        if (this.team.stats) {
          this.team.stats.goal_difference = (this.team.stats.goals_for || 0) - (this.team.stats.goals_against || 0);
          this.groupName.set(this.team.stats.group_name);
        }
        
        if (this.team.players) {
          this.team.topScorers = [...this.team.players]
            .filter((p: any) => p.goals > 0)
            .sort((a: any, b: any) => b.goals - a.goals)
            .slice(0, 3);
        }

        // Now fetch standings to show the team's group
        this.apiService.getStandings(seasonId || undefined).subscribe({
          next: (standingsData) => {
            if (this.groupName() && standingsData.groups && standingsData.groups[this.groupName()!]) {
              this.groupStandings.set(standingsData.groups[this.groupName()!]);
            }
            this.bestFourthId.set(standingsData.bestFourthId);
            this.isLoading.set(false);
          },
          error: (err) => {
            console.error('Error fetching standings for team detail:', err);
            this.isLoading.set(false);
          }
        });
      },
      error: (error) => {
        console.error('Error sacando equipo:', error);
        this.error.set('No se pudo sacar la información del equipo.');
        this.isLoading.set(false);
      }
    });
  }
}
