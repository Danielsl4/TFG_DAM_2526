import { Component, inject, OnInit, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api-service';
import { SeasonService } from '../../services/season-service';
import { Match } from '../../models/match.model';
import { StandingsTable } from '../../components/standings-table/standings-table';
import { MatchCard } from '../../components/match-card/match-card';

@Component({
  selector: 'app-standings',
  standalone: true,
  imports: [CommonModule, StandingsTable, MatchCard],
  templateUrl: './standings.html',
  styleUrl: './standings.css',
})

export class Standings implements OnInit {
  private apiService = inject(ApiService);
  private seasonService = inject(SeasonService);

  standings = signal<any>(null);
  bestFourthId = signal<number | null>(null);
  bestFourthsRanking = signal<any[]>([]);

  allMatches = signal<Match[]>([]);
  selectedPhase = signal<string>('fase_de_grupos');

  phases = [
    { id: 'fase_de_grupos', name: 'Fase de grupos' },
    { id: 'octavos', name: 'Octavos' },
    { id: 'cuartos', name: 'Cuartos' },
    { id: 'semis', name: 'Semifinales' },
    { id: 'final', name: 'Final' }
  ];

  isLoading = signal<boolean>(true);
  error = signal<string | null>(null);

  filteredMatches = computed(() => {
    return this.allMatches().filter(m => m.phase === this.selectedPhase());
  });

  constructor() {
    // Reaccionar automáticamente a cambios de temporada
    effect(() => {
      const seasonId = this.seasonService.currentSeasonId();
      if (seasonId !== null) {
        this.loadData(seasonId);
      }
    });
  }

  ngOnInit(): void {
    // El effect se encarga de la carga inicial
  }

  loadData(seasonId: number): void {
    this.isLoading.set(true);

    // Cargar clasificación
    this.apiService.getStandings(seasonId).subscribe({
      next: (data) => {
        this.standings.set(data.groups);
        this.bestFourthId.set(data.bestFourthId);
        this.bestFourthsRanking.set(data.fourthPlacesRanking || []);

        // Cargar partidos para las otras fases
        this.apiService.getMatches(seasonId).subscribe({
          next: (matches) => {
            this.allMatches.set(matches);
            this.isLoading.set(false);
          },
          error: (err) => {
            console.error('Error al obtener partidos:', err);
            this.isLoading.set(false);
          }
        });
      },
      error: (err) => {
        console.error('Error al obtener la clasificación:', err);
        this.error.set('No se ha podido cargar la clasificación.');
        this.isLoading.set(false);
      }
    });
  }

  setPhase(phaseId: string): void {
    this.selectedPhase.set(phaseId);
  }
}
