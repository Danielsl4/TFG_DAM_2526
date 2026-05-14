import { Component, Input, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api-service';
import { AuthService } from '../../services/auth.service';
import { Match } from '../../models/match.model';

@Component({
  selector: 'app-match-voting',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './match-voting.html',
  styleUrl: './match-voting.css',
})
export class MatchVoting {
  @Input({ required: true }) match!: Match;

  private apiService = inject(ApiService);
  private authService = inject(AuthService);

  protected isAuthenticated = this.authService.isAuthenticated;
  protected isVoting = signal<boolean>(false);

  onVote(event: Event, voteType: 'local' | 'empate' | 'visitante'): void {
    event.stopPropagation();
    if (!this.match || !this.isAuthenticated() || this.isVoting()) return;

    this.isVoting.set(true);

    this.apiService.vote(this.match.id, voteType).subscribe({
      next: (response) => {
        if (this.match) {
          this.match.votingStats = response.votingStats;
          this.match.userVote = voteType;
        }
        this.isVoting.set(false);
      },
      error: (err) => {
        console.error('Error al votar:', err);
        this.isVoting.set(false);
      }
    });
  }

  getPercentage(type: 'local' | 'draw' | 'away'): number {
    if (!this.match || !this.match.votingStats || this.match.votingStats.total === 0) {
      return 0;
    }
    const count = this.match.votingStats[type];
    return Math.round((count / this.match.votingStats.total) * 100);
  }
}
