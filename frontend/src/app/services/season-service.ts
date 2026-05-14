import { Injectable, signal, computed, inject } from '@angular/core';
import { ApiService } from './api-service';

@Injectable({
  providedIn: 'root'
})
export class SeasonService {
  private apiService = inject(ApiService);

  // El Signal que guarda la temporada seleccionada (null = carga la activa por defecto)
  private selectedSeasonId = signal<number | null>(null);
  
  // Lista de todas las temporadas disponibles
  private allSeasons = signal<any[]>([]);

  // Selectores computados para facilitar el acceso desde componentes
  public currentSeasonId = computed(() => this.selectedSeasonId());
  public seasons = computed(() => this.allSeasons());

  constructor() {
    this.loadSeasons();
  }

  /**
   * Carga la lista de temporadas y establece la activa por defecto si no hay selección
   */
  loadSeasons() {
    this.apiService.getSeasons().subscribe({
      next: (seasons) => {
        this.allSeasons.set(seasons);
        // Si no tenemos temporada seleccionada, buscamos la activa
        if (this.selectedSeasonId() === null) {
          const active = seasons.find(s => s.is_active);
          if (active) {
            this.selectedSeasonId.set(active.id);
          } else if (seasons.length > 0) {
            // Si no hay activa, cogemos la primera de la lista
            this.selectedSeasonId.set(seasons[0].id);
          }
        }
      }
    });
  }

  /**
   * Cambia la temporada actual
   */
  setSeason(id: number) {
    this.selectedSeasonId.set(id);
  }

  /**
   * Devuelve el objeto completo de la temporada seleccionada
   */
  getSelectedSeason() {
    return this.allSeasons().find(s => s.id === this.selectedSeasonId());
  }
}
