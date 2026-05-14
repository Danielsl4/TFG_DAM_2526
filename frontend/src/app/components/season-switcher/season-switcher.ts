import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SeasonService } from '../../services/season-service';

@Component({
  selector: 'app-season-switcher',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './season-switcher.html',
  styleUrl: './season-switcher.css'
})
export class SeasonSwitcher {
  protected seasonService = inject(SeasonService);
  
  // Señales expuestas para la vista
  protected seasons = this.seasonService.seasons;
  protected currentSeasonId = this.seasonService.currentSeasonId;
  
  isOpen = signal(false);

  toggleMenu() {
    this.isOpen.update(v => !v);
  }

  selectSeason(id: number) {
    this.seasonService.setSeason(id);
    this.isOpen.set(false);
  }

  getSelectedName() {
    return this.seasonService.getSelectedSeason()?.name || 'Temporada';
  }
}
