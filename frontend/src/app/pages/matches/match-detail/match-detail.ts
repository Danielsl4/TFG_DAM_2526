import { Component, OnInit, OnDestroy, inject, signal, HostListener, computed } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../../services/api-service';
import { AuthService } from '../../../services/auth.service';
import { Match } from '../../../models/match.model';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatchVoting } from '../../../components/match-voting/match-voting';
import Swal from 'sweetalert2';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-match-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, MatchVoting, FormsModule],
  templateUrl: './match-detail.html',
  styleUrl: './match-detail.css',
})
export class MatchDetail implements OnInit, OnDestroy {

  private route = inject(ActivatedRoute);
  private apiService = inject(ApiService);
  private authService = inject(AuthService);

  matchId = signal<string | null>(null);
  matchData = signal<Match | null>(null);
  matchEvents = signal<any[]>([]);
  isLoading = signal<boolean>(true);

  // --- Gestión de Partido (Centralizada en AuthService) ---
  protected isAdmin = this.authService.isAdmin;
  protected isReferee = this.authService.isReferee;
  protected canManage = computed(() => this.isAdmin() || this.isReferee());

  // --- Lógica de Penaltis ---
  showPenaltyShootout = computed(() => {
    const match = this.matchData();
    if (!match) return false;
    // Se muestra el botón si es eliminatoria y están empatados
    return match.phase !== 'fase_de_grupos' && match.homeGoals === match.awayGoals;
  });

  hasPenaltyEvents = computed(() => {
    return this.matchEvents().some(e => 
      e.type === 'penalty_shootout_goal' || e.type === 'penalty_shootout_miss'
    );
  });

  isLockedByMe = signal<boolean>(false);
  private heartbeatInterval: any;

  // --- Formulario de Eventos ---
  selectedTeamSide = signal<'home' | 'away' | null>(null);
  teamPlayers = signal<any[]>([]);
  selectedPlayerId = signal<number | null>(null);
  selectedEventType = signal<string>('gol');
  isSubmittingEvent = signal<boolean>(false);
  isManagingMatch = signal<boolean>(false);
  matchObservations = signal<string>('');
  allTeams = signal<any[]>([]);
  isPenaltyShootoutMode = signal<boolean>(false);
  selectedPenaltyTeamSide = signal<'home' | 'away' | null>(null);
  penaltyPlayers = signal<any[]>([]);
  selectedPenaltyPlayerId = signal<number | null>(null);

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.matchId.set(id);
      this.loadMatchData();
    } else {
      this.isLoading.set(false);
    }
  }

  ngOnDestroy() {
    this.stopHeartbeat();
    if (this.isLockedByMe()) {
      const id = this.matchId();
      if (id) this.apiService.unlockMatch(id).subscribe();
    }
  }

  @HostListener('window:beforeunload')
  onBeforeUnload() {
    if (this.isLockedByMe()) {
      const id = this.matchId();
      const token = localStorage.getItem('token');
      if (id && token) {
        // Enviar desbloqueo persistente al cerrar la pestaña
        navigator.sendBeacon(`${environment.apiUrl}/matches/${id}/unlock?token=${token}`);
      }
    }
  }

  private loadMatchData() {
    const id = this.matchId();
    if (!id) return;

    this.apiService.getMatchById(id).subscribe({
      next: (match) => {
        this.matchData.set(match);
        if (match.events) {
          this.matchEvents.set(match.events);
        }
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error al cargar el partido:', err);
        this.isLoading.set(false);
      }
    });
  }

  // --- Acciones de Gestión ---

  /**
   * Se ejecuta al pulsar "Gestionar Partido". 
   * Intenta obtener el bloqueo antes de mostrar el menú de opciones.
   */
  onManageMatch() {
    const id = this.matchId();
    if (!id || this.isManagingMatch()) return;

    this.isManagingMatch.set(true);
    this.apiService.lockMatch(id).subscribe({
      next: (res) => {
        this.isManagingMatch.set(false);
        if (res.success) {
          this.isLockedByMe.set(true);
          this.startHeartbeat();

          // Abrir modal de opciones manualmente
          const modalEl = document.getElementById('managementModal');
          if (modalEl) {
            const modal = (window as any).bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.show();
          }
        }
      },
      error: (err) => {
        this.isManagingMatch.set(false);
        this.handleEditError(err, 'No se puede gestionar el partido en este momento.');
      }
    });
  }

  /**
   * Se ejecuta al cerrar el menú de gestión sin haber entrado en un modo de edición.
   */
  onCloseManagementModal() {
    this.stopHeartbeat();
    if (this.isLockedByMe()) {
      const id = this.matchId();
      if (id) {
        this.apiService.unlockMatch(id).subscribe({
          next: () => this.isLockedByMe.set(false),
          error: () => this.isLockedByMe.set(false) // Asegurar reset aunque falle red
        });
      }
    }
  }

  onEditMode(isRealTime: boolean) {
    const id = this.matchId();
    if (!id || !this.isLockedByMe() || this.isManagingMatch()) return;

    if (isRealTime) {
      this.isManagingMatch.set(true);
      this.apiService.updateMatchStatus(id, 'en_curso').subscribe({
        next: () => {
          this.isManagingMatch.set(false);
          this.loadMatchData();
          this.openEventForm();
        },
        error: (err) => {
          this.isManagingMatch.set(false);
          console.error('Error al iniciar partido:', err);
          this.handleEditError(err, 'No se pudo iniciar el partido en directo.');
        }
      });
    } else {
      this.openEventForm();
    }
  }

  private handleEditError(err: any, defaultMsg: string) {
    // Si el interceptor ya manejó el 401, no hacemos nada más aquí
    if (err.status === 401) return;

    const message = err.error?.message || defaultMsg;

    Swal.fire({
      icon: 'error',
      title: 'Gestión no disponible',
      text: message,
      confirmButtonText: 'Entendido',
      confirmButtonColor: '#00AEEF',
      background: '#1C1F26',
      color: '#EDEDED',
    });
  }

  onFinalizeMode() {
    const id = this.matchId();
    if (!id || !this.isLockedByMe()) return;

    // Cerrar el modal de gestión si está abierto
    const mModal = document.getElementById('managementModal');
    if (mModal) {
      const modalInstance = (window as any).bootstrap.Modal.getOrCreateInstance(mModal);
      modalInstance.hide();
    }

    Swal.fire({
      title: 'Finalizar Acta del Partido',
      text: '¿Deseas añadir alguna observación o incidencia antes de cerrar el acta?',
      input: 'textarea',
      inputPlaceholder: 'Escribe aquí las observaciones (opcional)...',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#00AEEF',
      cancelButtonColor: '#67728C',
      confirmButtonText: 'Finalizar Partido',
      cancelButtonText: 'Cancelar',
      background: '#1C1F26',
      color: '#EDEDED',
      preConfirm: (observations) => {
        return new Promise((resolve) => {
          this.apiService.finishMatch(id, observations).subscribe({
            next: () => resolve(true),
            error: (err) => {
              Swal.showValidationMessage(`Error: ${err.error?.message || 'No se pudo finalizar'}`);
              resolve(false);
            }
          });
        });
      }
    }).then((result) => {
      if (result.isConfirmed) {
        this.loadMatchData();
        this.isLockedByMe.set(false);
        this.stopHeartbeat();
        Swal.fire({
          icon: 'success',
          title: '¡Partido Finalizado!',
          text: 'El acta se ha cerrado y la clasificación ha sido actualizada.',
          background: '#1C1F26',
          color: '#EDEDED',
          confirmButtonColor: '#00AEEF'
        });
      }
    });
  }

  onAddObservationsMode() {
    const id = this.matchId();
    const currentData = this.matchData();
    if (!id || !currentData || !this.isLockedByMe()) return;

    const mModal = document.getElementById('managementModal');
    if (mModal) {
      const modalInstance = (window as any).bootstrap.Modal.getOrCreateInstance(mModal);
      modalInstance.hide();
    }

    Swal.fire({
      title: 'Observaciones del acta',
      text: 'Añade cualquier incidencia o nota relevante sobre el partido.',
      input: 'textarea',
      inputValue: currentData.observations || '',
      inputPlaceholder: 'Escribe aquí las observaciones...',
      icon: 'info',
      showCancelButton: true,
      confirmButtonColor: '#00AEEF',
      cancelButtonColor: '#67728C',
      confirmButtonText: 'Guardar cambios',
      cancelButtonText: 'Cancelar',
      background: '#1C1F26',
      color: '#EDEDED',
      preConfirm: (observations) => {
        return new Promise((resolve) => {
          this.apiService.updateMatchObservations(id, observations).subscribe({
            next: () => resolve(true),
            error: (err) => {
              Swal.showValidationMessage(`Error: ${err.error?.message || 'No se pudo guardar'}`);
              resolve(false);
            }
          });
        });
      }
    }).then((result) => {
      if (result.isConfirmed) {
        this.loadMatchData();
        this.isLockedByMe.set(false);
        this.stopHeartbeat();
        Swal.fire({
          icon: 'success',
          title: '¡Guardado!',
          text: 'Las observaciones han sido actualizadas correctamente.',
          background: '#1C1F26',
          color: '#EDEDED',
          confirmButtonColor: '#00AEEF'
        });
      }
    });
  }

  onSetupTeams() {
    const id = this.matchId();
    const match = this.matchData();
    if (!id || !match || !this.isAdmin()) return;

    // Cargar equipos si no los tenemos
    if (this.allTeams().length === 0) {
      this.apiService.getTeams(undefined, 1, 100).subscribe(res => {
        const teams = res.teams || [];
        this.allTeams.set(teams);
        this.showSetupTeamsModal(id, match);
      });
    } else {
      this.showSetupTeamsModal(id, match);
    }
  }

  private showSetupTeamsModal(id: string, match: any) {
    const teams = this.allTeams();

    // Crear opciones para el select
    const teamOptions = teams.map(t => `<option value="${t.id}" ${match.homeTeam?.id === t.id ? 'selected' : ''}>${t.name}</option>`).join('');
    const awayOptions = teams.map(t => `<option value="${t.id}" ${match.awayTeam?.id === t.id ? 'selected' : ''}>${t.name}</option>`).join('');

    Swal.fire({
      title: 'Configurar Emparejamiento',
      html: `
        <div class="text-start">
          <div class="mb-3">
            <label class="small fw-bold text-muted mb-1">EQUIPO LOCAL</label>
            <select id="hTeam" class="form-select bg-dark text-white border-secondary mb-2">
              <option value="">-- Seleccionar Equipo --</option>
              ${teamOptions}
            </select>
            <input id="hPlace" type="text" class="form-control form-control-sm bg-dark text-white border-secondary" 
                   placeholder="Placeholder (ej: 1º Grupo A)" value="${match.homeTeamPlaceholder || ''}">
          </div>
          <div class="mb-3">
            <label class="small fw-bold text-muted mb-1">EQUIPO VISITANTE</label>
            <select id="aTeam" class="form-select bg-dark text-white border-secondary mb-2">
              <option value="">-- Seleccionar Equipo --</option>
              ${awayOptions}
            </select>
            <input id="aPlace" type="text" class="form-control form-control-sm bg-dark text-white border-secondary" 
                   placeholder="Placeholder (ej: 2º Grupo B)" value="${match.awayTeamPlaceholder || ''}">
          </div>
          <p class="text-muted text-xxs mt-3">Nota: Si seleccionas un equipo real, el placeholder se ignorará en la visualización principal.</p>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar Cambios',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#00AEEF',
      background: '#1C1F26',
      color: '#EDEDED',
      preConfirm: () => {
        const hId = (document.getElementById('hTeam') as HTMLSelectElement).value;
        const aId = (document.getElementById('aTeam') as HTMLSelectElement).value;
        const hP = (document.getElementById('hPlace') as HTMLInputElement).value;
        const aP = (document.getElementById('aPlace') as HTMLInputElement).value;

        return {
          homeTeamId: hId ? parseInt(hId) : null,
          awayTeamId: aId ? parseInt(aId) : null,
          homePlaceholder: hP || null,
          awayPlaceholder: aP || null
        };
      }
    }).then((result) => {
      if (result.isConfirmed) {
        this.apiService.updateMatchTeams(id, result.value).subscribe({
          next: () => {
            this.loadMatchData();
            Swal.fire({
              icon: 'success',
              title: '¡Actualizado!',
              text: 'Los equipos han sido asignados correctamente.',
              background: '#1C1F26',
              color: '#EDEDED',
              confirmButtonColor: '#00AEEF'
            });
          },
          error: (err) => {
            Swal.fire({
              icon: 'error',
              title: 'Error',
              text: err.error?.message || 'No se pudieron actualizar los equipos',
              background: '#1C1F26',
              color: '#EDEDED'
            });
          }
        });
      }
    });
  }

  private openEventForm() {
    // Usar la API de Bootstrap para cerrar el primer modal de forma limpia
    const mModal = document.getElementById('managementModal');
    if (mModal) {
      const modalInstance = (window as any).bootstrap.Modal.getOrCreateInstance(mModal);
      modalInstance.hide();
    }

    // Abrir el segundo modal
    const eventModal = new (window as any).bootstrap.Modal(document.getElementById('eventInsertModal'));
    eventModal.show();
  }

  onStartPenaltyShootout() {
    this.isPenaltyShootoutMode.set(true);
    // Cerrar modal de gestión de forma limpia
    const mModalElement = document.getElementById('managementModal');
    if (mModalElement) {
      const modalInstance = (window as any).bootstrap.Modal.getOrCreateInstance(mModalElement);
      modalInstance.hide();
    }

    // Esperar un breve momento para que el backdrop se limpie antes de abrir el siguiente
    setTimeout(() => {
      const pModalElement = document.getElementById('penaltyShootoutModal');
      if (pModalElement) {
        const pModal = new (window as any).bootstrap.Modal(pModalElement);
        pModal.show();
      }
    }, 300);
  }

  onPenaltyTeamSelect() {
    const side = this.selectedPenaltyTeamSide();
    const match = this.matchData();
    if (!side || !match) return;

    const teamId = side === 'home' ? match.homeTeam?.id : match.awayTeam?.id;
    if (!teamId) return;

    this.apiService.getTeamById(teamId.toString()).subscribe(data => {
      this.penaltyPlayers.set(data.players);
    });
  }

  submitPenalty(wasScored: boolean) {
    const id = this.matchId();
    const playerId = this.selectedPenaltyPlayerId();
    const side = this.selectedPenaltyTeamSide();

    if (!id || !playerId || !side || this.isSubmittingEvent()) {
      Swal.fire({ icon: 'warning', title: 'Atención', text: 'Selecciona un jugador primero' });
      return;
    }

    const type = wasScored ? 'penalti_tanda_marcado' : 'penalti_tanda_fallado';

    this.isSubmittingEvent.set(true);

    this.apiService.addMatchEvent(id, type, playerId, side).subscribe({
      next: () => {
        this.isSubmittingEvent.set(false);
        this.loadMatchData();
        // Resetear selección para el siguiente tiro
        this.selectedPenaltyPlayerId.set(null);
        
        // Mostrar aviso de éxito tipo Toast
        const Toast = Swal.mixin({
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 2000,
          timerProgressBar: true,
          background: '#1C1F26',
          color: '#EDEDED'
        });
        Toast.fire({
          icon: 'success',
          title: 'Penalti registrado'
        });
      },
      error: (err) => {
        this.isSubmittingEvent.set(false);
        Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo registrar el penalti' });
      }
    });
  }

  onTeamSelect() {
    const side = this.selectedTeamSide();
    const match = this.matchData();
    if (!side || !match) return;

    const teamId = side === 'home' ? match.homeTeam?.id : match.awayTeam?.id;
    if (teamId) {
      this.apiService.getTeamById(teamId.toString()).subscribe(res => {
        this.teamPlayers.set(res.players || []);
      });
    }
  }

  submitEvent() {
    const matchId = this.matchId();
    const type = this.selectedEventType();
    const playerId = this.selectedPlayerId();
    const side = this.selectedTeamSide();

    if (!matchId || !type || !playerId || !side) return;

    this.isSubmittingEvent.set(true);
    this.apiService.addMatchEvent(matchId, type, playerId, side).subscribe({
      next: () => {
        this.isSubmittingEvent.set(false);
        // Pequeño retardo para asegurar que la caché en el servidor se ha limpiado
        setTimeout(() => this.loadMatchData(), 500); 
        this.selectedPlayerId.set(null); 

        // Cerrar el modal automáticamente para ver los cambios
        const modalElement = document.getElementById('eventInsertModal');
        if (modalElement) {
          const modalInstance = (window as any).bootstrap.Modal.getOrCreateInstance(modalElement);
          modalInstance.hide();
        }
      },
      error: (err) => {
        this.isSubmittingEvent.set(false);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'Error al insertar evento: ' + (err.error?.message || 'Error desconocido'),
          background: '#1C1F26',
          color: '#EDEDED',
          confirmButtonColor: '#00AEEF'
        });
      }
    });
  }


  deleteEvent(eventId: number) {
    const matchId = this.matchId();
    if (!matchId) return;

    Swal.fire({
      title: '¿Eliminar evento?',
      text: '¿Estás seguro de que deseas eliminar este evento? Se ajustará el marcador y las estadísticas automáticamente.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#67728C',
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar',
      background: '#1C1F26',
      color: '#EDEDED'
    }).then((result) => {
      if (result.isConfirmed) {
        Swal.showLoading();
        this.apiService.deleteMatchEvent(matchId, eventId).subscribe({
          next: () => {
            setTimeout(() => {
              this.loadMatchData();
              Swal.close();
            }, 500);
          },
          error: (err) => {
            Swal.fire({
              icon: 'error',
              title: 'Error',
              text: 'Error al eliminar: ' + (err.error?.message || 'Error desconocido'),
              background: '#1C1F26',
              color: '#EDEDED',
              confirmButtonColor: '#00AEEF'
            });
          }
        });
      }
    });
  }

  onCloseEventModal() {
    this.stopHeartbeat();
    const id = this.matchId();
    if (id && this.isLockedByMe()) {
      this.apiService.unlockMatch(id).subscribe({
        next: () => this.isLockedByMe.set(false),
        error: () => this.isLockedByMe.set(false)
      });
    }
  }

  // --- Helpers Bloqueo ---

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      const id = this.matchId();
      if (id) {
        this.apiService.lockMatch(id).subscribe({
          error: () => this.stopHeartbeat() // Si falla renovar, paramos
        });
      }
    }, 60000); // Cada minuto
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}
