import { Component, OnInit, signal, computed, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Match } from '../../models/match.model';
import { ApiService } from '../../services/api-service';
import { SeasonService } from '../../services/season-service';
import { MatchCard } from '../../components/match-card/match-card';

@Component({
  selector: 'app-matches',
  standalone: true,
  imports: [CommonModule, MatchCard],
  templateUrl: './matches.html',
  styleUrl: './matches.css',
})
export class Matches implements OnInit {
  private apiService = inject(ApiService);
  private seasonService = inject(SeasonService);

  matches = signal<Match[]>([]);
  isLoading = signal<boolean>(true);
  selectedDay = signal<string>('Jueves');
  days = ['Jueves', 'Viernes', 'Sábado', 'Domingo'];

  currentPage = signal<number>(1);
  pageSize = 12;

  allFilteredMatches = computed(() => {
    return this.matches().filter(m => m.dayOfWeek == this.selectedDay());
  });

  paginatedMatches = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    const end = start + this.pageSize;
    return this.allFilteredMatches().slice(start, end);
  });

  totalPages = computed(() => {
    return Math.ceil(this.allFilteredMatches().length / this.pageSize);
  });

  pages = computed(() => {
    const total = this.totalPages();
    return Array.from({ length: total }, (_, i) => i + 1);
  });

  constructor() {
    effect(() => {
      const seasonId = this.seasonService.currentSeasonId();
      if (seasonId !== null) {
        this.loadMatches(seasonId);
      }
    });
  }

  ngOnInit(): void {
    // El effect se encarga de la carga inicial
  }

  loadMatches(seasonId: number): void {
    this.isLoading.set(true);
    this.apiService.getMatches(seasonId).subscribe({
      next: (data) => {
        this.matches.set(data);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error cargando partidos:', err);
        this.isLoading.set(false);
      }
    });
  }

  setFilter(day: string): void {
    this.selectedDay.set(day);
    this.currentPage.set(1);
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
}

