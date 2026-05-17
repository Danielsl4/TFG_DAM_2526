import { Component, inject, OnInit, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../../services/api-service';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { SeasonService } from '../../../services/season-service';

@Component({
  selector: 'app-admin-logs',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './logs.html',
  styleUrl: './logs.css'
})
export class Logs implements OnInit {
  private apiService = inject(ApiService);
  private router = inject(Router);
  private seasonService = inject(SeasonService);

  logs: any[] = [];
  total: number = 0;
  page: number = 1;
  limit: number = 20;
  loading: boolean = false;

  constructor() {
    effect(() => {
      const sId = this.seasonService.currentSeasonId();
      this.onFilter();
    });
  }

  // Filtros
  userSearch: string = '';
  dateSearch: string = '';
  private searchSubject = new Subject<string>();

  ngOnInit() {
    this.searchSubject.pipe(
      debounceTime(500),
      distinctUntilChanged()
    ).subscribe(() => {
      this.onFilter();
    });
    this.loadLogs();
  }

  onSearchInput() {
    this.searchSubject.next(this.userSearch);
  }

  loadLogs() {
    this.loading = true;
    const sId = this.seasonService.currentSeasonId();
    this.apiService.getAdminLogs(this.page, this.limit, sId || undefined, this.userSearch, this.dateSearch).subscribe({
      next: (data) => {
        this.logs = data.logs;
        this.total = data.total;
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading logs', err);
        this.loading = false;
      }
    });
  }

  onFilter() {
    this.page = 1;
    this.loadLogs();
  }

  clearFilters() {
    this.userSearch = '';
    this.dateSearch = '';
    this.page = 1;
    this.loadLogs();
  }

  nextPage() {
    if (this.page * this.limit < this.total) {
      this.page++;
      this.loadLogs();
    }
  }

  prevPage() {
    if (this.page > 1) {
      this.page--;
      this.loadLogs();
    }
  }

  get totalPages(): number {
    return Math.ceil(this.total / this.limit);
  }

  isNewDay(current: any, previous: any): boolean {
    if (!previous) return true;
    const d1 = new Date(current.created_at).toDateString();
    const d2 = new Date(previous.created_at).toDateString();
    return d1 !== d2;
  }

  getEntityIcon(type: string): string {
    const icons: { [key: string]: string } = {
      'team': 'fas fa-shield-alt',
      'player': 'fas fa-user',
      'match': 'fas fa-calendar-alt',
      'user': 'fas fa-user-cog',
      'season': 'fas fa-trophy',
      'group': 'fas fa-layer-group',
      'field': 'fas fa-map-marker-alt'
    };
    return icons[type] || 'fas fa-dot-circle';
  }

  formatAction(action: string): string {
    const mapping: { [key: string]: string } = {
      'CREATE_TEAM': 'Creación de equipo',
      'UPDATE_TEAM': 'Actualización de equipo',
      'DELETE_TEAM': 'Eliminación de equipo',
      'CREATE_PLAYER': 'Creación de jugador',
      'UPDATE_PLAYER': 'Actualización de jugador',
      'DELETE_PLAYER': 'Eliminación de jugador',
      'ADD_PLAYER': 'Añadir jugador',
      'CREATE_SEASON': 'Creación de temporada',
      'UPDATE_SEASON': 'Actualización de temporada',
      'DELETE_SEASON': 'Eliminación de temporada',
      'ADD_EVENT': 'Añadir evento',
      'DELETE_EVENT': 'Eliminar evento',
      'FINISH_MATCH': 'Finalización de partido',
      'LOCK_MATCH': 'Bloqueo de partido',
      'UNLOCK_MATCH': 'Desbloqueo de partido'
    };
    return mapping[action] || action;
  }

  getHumanDetails(log: any): string {
    const d = log.details || {};
    const action = log.action;

    if (action.includes('match') || action.includes('partido') || action === 'ADD_EVENT') {
      if (d.type === 'gol') return 'Se ha registrado un gol en el marcador.';
      if (d.type === 'tarjeta_amarilla') return 'Se ha mostrado una tarjeta amarilla.';
      if (d.type === 'tarjeta_roja') return 'Se ha mostrado una tarjeta roja.';
      if (d.home_goals !== undefined) return `El partido terminó con un resultado de ${d.home_goals} - ${d.away_goals}.`;
    }

    if (action.includes('usuario')) {
      if (d.role) return `Se ha cambiado el rol a "${d.role}" y los puntos a ${d.points}.`;
    }

    if (action.includes('temporada') && d.imported_from) {
      return `Se ha creado importando la estructura de la temporada ID ${d.imported_from}.`;
    }

    if (d.name) return `Acción realizada sobre "${d.name}".`;

    return 'Se realizaron cambios técnicos en los registros de esta entidad.';
  }

  hasExtraDetails(log: any): boolean {
    if (!log.details) return false;
    const keys = Object.keys(log.details).filter(k => k !== 'name' && k !== 'season_id');
    return keys.length > 0;
  }

  getExtraDetails(log: any): any[] {
    if (!log.details) return [];
    return Object.keys(log.details)
      .filter(k => k !== 'name' && k !== 'season_id')
      .map(key => ({
        key: this.translateKey(key),
        value: log.details[key]
      }));
  }

  private translateKey(key: string): string {
    const keys: { [key: string]: string } = {
      'role': 'Rol',
      'points': 'Puntos',
      'team_id': 'Equipo',
      'player_id': 'Jugador',
      'date': 'Fecha',
      'type': 'Tipo',
      'mode': 'Modo'
    };
    return keys[key] || key;
  }

  translateEntity(type: string): string {
    const types: { [key: string]: string } = {
      'team': 'equipo',
      'player': 'jugador',
      'match': 'partido',
      'user': 'usuario',
      'season': 'temporada',
      'group': 'grupo',
      'field': 'sede'
    };
    return types[type] || type;
  }

  getEntityLink(log: any): string {
    const type = log.entity_type;
    switch (type) {
      case 'team': return '/admin/teams';
      case 'player': return '/admin/players';
      case 'user': return '/admin/users';
      case 'match':
      case 'season':
      case 'group':
        return '/admin/competitions';
      default: return '';
    }
  }

  getSearchParam(log: any): any {
    if (log.details?.name) {
      return { search: log.details.name };
    }
    return {};
  }
}
