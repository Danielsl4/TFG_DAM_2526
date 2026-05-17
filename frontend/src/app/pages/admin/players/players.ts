import { Component, inject, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../../services/api-service';
import { SeasonService } from '../../../services/season-service';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-players',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './players.html',
  styleUrl: './players.css',
})
export class Players implements OnInit {
  private apiService = inject(ApiService);
  private seasonService = inject(SeasonService);
  private route = inject(ActivatedRoute);

  players: any[] = [];
  pagination = {
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  };

  teams: any[] = [];
  searchTerm: string = '';

  constructor() {
    effect(() => {
      const seasonId = this.seasonService.currentSeasonId();
      if (seasonId) {
        this.pagination.page = 1; // Resetear a página 1 al cambiar temporada
        this.loadPlayers();
        this.loadTeams();
      }
    });
  }

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params['search']) {
        this.searchTerm = params['search'];
        this.loadPlayers();
      }
    });
  }

  loadPlayers() {
    const seasonId = this.seasonService.currentSeasonId();
    this.apiService.getPlayers(
      seasonId || undefined,
      this.pagination.page,
      this.pagination.limit,
      this.searchTerm
    ).subscribe({
      next: (res) => {
        this.players = res.players;
        this.pagination = res.pagination;
      },
      error: (err) => console.error('Error cargando jugadores', err)
    });
  }

  loadTeams() {
    const seasonId = this.seasonService.currentSeasonId();
    this.apiService.getTeams(seasonId || undefined, 1, 100).subscribe({ // Cargamos todos los equipos para los selects
      next: (res) => this.teams = res.teams,
      error: (err) => console.error('Error cargando equipos', err)
    });
  }

  onSearch() {
    this.pagination.page = 1;
    this.loadPlayers();
  }

  changePage(newPage: number) {
    if (newPage >= 1 && newPage <= this.pagination.totalPages) {
      this.pagination.page = newPage;
      this.loadPlayers();
    }
  }

  async openCreateModal() {
    let uploadedPhotoUrl = '';

    const secondaryColor = getComputedStyle(document.documentElement).getPropertyValue('--secundario').trim() || '#f7941d';

    const { value: formValues } = await Swal.fire({
      title: 'Crear Nuevo Jugador',
      html: `
        <div class="swal-form">
          <div class="swal-field">
            <label>Nombre Completo</label>
            <input id="swal-name" class="swal-input-custom" placeholder="Ej: Juan Pérez">
          </div>
          <div class="swal-field">
            <label>Fecha de Nacimiento</label>
            <input id="swal-birth" class="swal-input-custom" type="date">
          </div>
          <div class="swal-field">
            <label>Equipo (Opcional)</label>
            <select id="swal-team" class="swal-select-custom">
              <option value="">-- Seleccionar Equipo --</option>
              ${this.teams.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
            </select>
          </div>
          <div class="swal-field">
            <label>Dorsal (Opcional)</label>
            <input id="swal-dorsal-create" class="swal-input-custom" type="text" placeholder="Ej: 10">
          </div>
          <div class="swal-file-container">
            <label for="swal-file">
              <i class="fas fa-cloud-upload-alt"></i> Subir Foto
            </label>
            <input type="file" id="swal-file" hidden accept="image/*">
            <div id="swal-preview" class="image-preview"></div>
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Crear Jugador',
      confirmButtonColor: secondaryColor,
      didOpen: () => {
        const nameInput = document.getElementById('swal-name') as HTMLInputElement;
        const duplicateWarn = document.createElement('div');
        duplicateWarn.id = 'duplicate-warning';
        duplicateWarn.style.cssText = 'color: #f7941d; font-size: 0.8rem; margin-top: 5px; display: none; background: rgba(247, 148, 29, 0.1); padding: 8px; border-radius: 6px; border: 1px dashed #f7941d;';
        nameInput.parentNode?.insertBefore(duplicateWarn, nameInput.nextSibling);

        nameInput.addEventListener('input', () => {
          const query = nameInput.value;
          if (query.length < 3) {
            duplicateWarn.style.display = 'none';
            return;
          }

          this.apiService.getPlayers(undefined, 1, 5, query).subscribe({
            next: (res) => {
              if (res.players.length > 0) {
                duplicateWarn.innerHTML = `
                  <i class="fas fa-exclamation-triangle"></i> 
                  <strong>¡Atención!</strong> Ya hay ${res.players.length} jugador(es) con este nombre. 
                  Usa "Fichar Existente" si es el mismo.
                `;
                duplicateWarn.style.display = 'block';
              } else {
                duplicateWarn.style.display = 'none';
              }
            }
          });
        });

        const fileInput = document.getElementById('swal-file') as HTMLInputElement;
        fileInput.addEventListener('change', (e: any) => {
          const file = e.target.files[0];
          if (file) {
            Swal.showLoading();
            const playerName = (document.getElementById('swal-name') as HTMLInputElement).value;

            this.apiService.uploadImage(file, 'players', playerName).subscribe({
              next: (res) => {
                uploadedPhotoUrl = res.url;
                const preview = document.getElementById('swal-preview') as HTMLElement;
                preview.innerHTML = `<img src="${res.url}" style="max-width: 100px; margin-top: 10px; border-radius: 50%;">`;
                Swal.hideLoading();
              },
              error: () => Swal.fire('Error', 'No se pudo subir la foto', 'error')
            });
          }
        });
      },
      preConfirm: () => {
        const name = (document.getElementById('swal-name') as HTMLInputElement).value;
        if (!name) {
          Swal.showValidationMessage('El nombre es obligatorio');
          return false;
        }
        return {
          name,
          birth_date: (document.getElementById('swal-birth') as HTMLInputElement).value,
          photo_url: uploadedPhotoUrl || '/images/default-player.webp',
          team_id: (document.getElementById('swal-team') as HTMLSelectElement).value,
          jersey_number: (document.getElementById('swal-dorsal-create') as HTMLInputElement).value
        };
      }
    });

    if (formValues) {
      Swal.showLoading();
      const seasonId = this.seasonService.currentSeasonId();

      this.apiService.createPlayer(formValues).subscribe({
        next: (res) => {
          // Si hay temporada seleccionada, inscribir al jugador (tenga equipo o no)
          if (seasonId) {
            this.apiService.registerPlayer({
              player_id: res.player.id,
              team_id: formValues.team_id ? Number(formValues.team_id) : null,
              season_id: seasonId,
              jersey_number: formValues.jersey_number || null
            }).subscribe({
              next: () => {
                const msg = formValues.team_id ? 'El jugador ha sido creado e inscrito en el equipo.' : 'El jugador ha sido creado e inscrito en la temporada (sin equipo).';
                Swal.fire('¡Listo!', msg, 'success');
                this.loadPlayers();
              },
              error: () => {
                Swal.fire('Atención', 'Jugador creado pero hubo un error al inscribirlo en la temporada.', 'warning');
                this.loadPlayers();
              }
            });
          } else {
            Swal.fire('¡Creado!', 'El jugador ha sido creado correctamente.', 'success');
            this.loadPlayers();
          }
        },
        error: (err) => {
          Swal.hideLoading();
          Swal.fire('Error', 'No se pudo crear el jugador', 'error');
        }
      });
    }
  }

  /**
   * Abre un modal para buscar y añadir jugadores que ya existen en el sistema global
   */
  async openAddExistingModal() {
    const seasonId = this.seasonService.currentSeasonId();
    if (!seasonId) {
      Swal.fire('Error', 'Debes seleccionar una temporada primero', 'error');
      return;
    }

    const secondaryColor = getComputedStyle(document.documentElement).getPropertyValue('--secundario').trim() || '#f7941d';

    Swal.fire({
      title: 'Fichar Jugador Existente',
      html: `
        <style>
          .existing-results-container {
            max-height: 300px;
            overflow-y: auto;
            margin-top: 15px;
            border-radius: 10px;
            border: 1px solid #eee;
          }
          .player-search-item {
            display: flex;
            align-items: center;
            padding: 12px;
            cursor: pointer;
            border-bottom: 1px solid #f5f5f5;
            transition: background 0.2s;
          }
          .player-search-item:hover { background: #f9f9f9; }
          .player-search-item img.mini-photo {
            width: 45px !important;
            height: 45px !important;
            border-radius: 50% !important;
            object-fit: cover !important;
            margin-right: 15px !important;
            border: 2px solid #eee !important;
          }
          .player-info-meta { text-align: left; flex: 1; }
          .player-info-meta strong { display: block; color: #333; font-size: 1rem; }
          .player-info-meta span { color: #888; font-size: 0.8rem; }
        </style>
        <div class="swal-form">
          <p class="text-muted mb-3">Busca un jugador que ya haya participado en otras temporadas.</p>
          <div class="swal-field">
            <input id="search-existing" class="swal-input-custom" placeholder="Escribe el nombre del jugador...">
          </div>
          <div id="existing-results" class="existing-results-container">
            <!-- Los resultados aparecerán aquí -->
          </div>
          <div id="selection-form" style="display: none;" class="mt-3 p-3 border-top bg-light rounded">
            <h5 id="selected-player-name" class="mb-3 text-primary"></h5>
            <div class="swal-field">
              <label>Equipo para esta temporada</label>
              <select id="swal-team-add" class="swal-select-custom">
                <option value="">-- Sin equipo --</option>
                ${this.teams.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
              </select>
            </div>
            <div class="swal-field mt-2">
              <label>Dorsal</label>
              <input id="swal-dorsal-add" class="swal-input-custom" type="text" placeholder="Ej: 10">
            </div>
            <button id="btn-confirm-add" class="btn-primary w-100 mt-3" style="justify-content: center;">Confirmar Fichaje</button>
          </div>
        </div>
      `,
      showConfirmButton: false,
      showCloseButton: true,
      width: '500px',
      didOpen: () => {
        const searchInput = document.getElementById('search-existing') as HTMLInputElement;
        const resultsContainer = document.getElementById('existing-results') as HTMLElement;
        const selectionForm = document.getElementById('selection-form') as HTMLElement;
        let selectedPlayerId: number | null = null;

        searchInput.addEventListener('input', (e: any) => {
          const query = e.target.value;
          if (query.length < 2) {
            resultsContainer.innerHTML = '';
            selectionForm.style.display = 'none';
            return;
          }

          // Buscamos jugadores globales excluyendo la temporada actual
          this.apiService.getPlayers(undefined, 1, 50, query, seasonId).subscribe({
            next: (res) => {
              const availablePlayers = res.players;

              if (availablePlayers.length === 0) {
                resultsContainer.innerHTML = '<p class="text-center p-3 text-muted">No se encontraron jugadores disponibles.</p>';
                return;
              }

              resultsContainer.innerHTML = availablePlayers.map((p: any) => `
                <div class="player-search-item" data-id="${p.id}" data-name="${p.name}">
                  <img src="${p.photo_url || '/images/default-player.webp'}" class="mini-photo">
                  <div class="player-info-meta">
                    <strong>${p.name}</strong>
                    <span style="font-size: 0.75rem; color: #777;">
                      ${p.birth_date ? new Date(p.birth_date).toLocaleDateString() : 'Sin fecha'} 
                      ${p.last_team ? ' | ' + p.last_team : ''}
                    </span>
                  </div>
                  <i class="fas fa-chevron-right" style="color: #ccc;"></i>
                </div>
              `).join('');

              // Evento para seleccionar
              resultsContainer.querySelectorAll('.player-search-item').forEach(item => {
                item.addEventListener('click', () => {
                  selectedPlayerId = Number(item.getAttribute('data-id'));
                  const name = item.getAttribute('data-name');
                  
                  // Mostrar formulario de inscripción
                  (document.getElementById('selected-player-name') as HTMLElement).innerText = `Inscribir a ${name}`;
                  selectionForm.style.display = 'block';
                  resultsContainer.innerHTML = ''; // Limpiar resultados
                });
              });
            }
          });
        });

        // Evento confirmar
        document.getElementById('btn-confirm-add')?.addEventListener('click', () => {
          if (!selectedPlayerId) return;
          const teamId = (document.getElementById('swal-team-add') as HTMLSelectElement).value;
          const jersey = (document.getElementById('swal-dorsal-add') as HTMLInputElement).value;

          Swal.showLoading();
          this.apiService.registerPlayer({
            player_id: selectedPlayerId,
            team_id: teamId ? Number(teamId) : null,
            season_id: seasonId,
            jersey_number: jersey || null
          }).subscribe({
            next: () => {
              Swal.fire('¡Fichado!', 'El jugador ha sido inscrito en la temporada.', 'success');
              this.loadPlayers();
            },
            error: (err) => {
              Swal.fire('Error', err.error?.message || 'No se pudo inscribir al jugador', 'error');
            }
          });
        });
      }
    });
  }

  async openEditModal(player: any) {
    let uploadedPhotoUrl = player.photo_url;
    const seasonId = this.seasonService.currentSeasonId();

    const secondaryColor = getComputedStyle(document.documentElement).getPropertyValue('--secundario').trim() || '#f7941d';

    const { value: formValues } = await Swal.fire({
      title: 'Editar Jugador',
      html: `
        <div class="swal-form">
          <div class="swal-field">
            <label>Nombre</label>
            <input id="swal-name" class="swal-input-custom" placeholder="Nombre" value="${player.name}">
          </div>
          <div class="swal-field">
            <label>Fecha de Nacimiento</label>
            <input id="swal-birth" class="swal-input-custom" type="date" value="${player.birth_date ? player.birth_date.split('T')[0] : ''}">
          </div>
          
          <div class="swal-field">
            <label>Equipo para esta temporada</label>
            <select id="swal-team" class="swal-select-custom">
              <option value="">-- Sin equipo --</option>
              ${this.teams.map(t => `<option value="${t.id}" ${player.team_id == t.id ? 'selected' : ''}>${t.name}</option>`).join('')}
            </select>
          </div>

          <div class="swal-field">
            <label>Dorsal</label>
            <input id="swal-dorsal" class="swal-input-custom" type="text" placeholder="Ej: 10" value="${player.jersey_number || ''}">
          </div>

          <div class="swal-file-container">
            <label for="swal-file">
              <i class="fas fa-camera"></i> Cambiar Foto
            </label>
            <input type="file" id="swal-file" hidden accept="image/*">
            <div id="swal-preview" class="image-preview">
              ${player.photo_url ? `<img src="${player.photo_url}">` : ''}
            </div>
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Guardar Cambios',
      confirmButtonColor: secondaryColor,
      didOpen: () => {
        const fileInput = document.getElementById('swal-file') as HTMLInputElement;
        fileInput.addEventListener('change', (e: any) => {
          const file = e.target.files[0];
          if (file) {
            Swal.showLoading();
            const playerName = (document.getElementById('swal-name') as HTMLInputElement).value;
            this.apiService.uploadImage(file, 'players', playerName || player.name).subscribe({
              next: (res) => {
                uploadedPhotoUrl = res.url;
                const preview = document.getElementById('swal-preview') as HTMLElement;
                preview.innerHTML = `<img src="${res.url}" style="max-width: 100px; margin-top: 10px; border-radius: 50%;">`;
                Swal.hideLoading();
              },
              error: () => Swal.fire('Error', 'No se pudo subir la foto', 'error')
            });
          }
        });
      },
      preConfirm: () => {
        return {
          name: (document.getElementById('swal-name') as HTMLInputElement).value,
          birth_date: (document.getElementById('swal-birth') as HTMLInputElement).value,
          photo_url: uploadedPhotoUrl,
          team_id: (document.getElementById('swal-team') as HTMLSelectElement).value,
          jersey_number: (document.getElementById('swal-dorsal') as HTMLInputElement).value
        };
      }
    });

    if (formValues) {
      Swal.showLoading();
      // 1. Actualizar datos personales
      this.apiService.updatePlayer(player.id, formValues).subscribe({
        next: () => {
          // 2. Si hay temporada, gestionar inscripción o baja
          if (seasonId) {
            if (formValues.team_id) {
              // Inscribir o actualizar inscripción
              this.apiService.registerPlayer({
                player_id: player.id,
                team_id: parseInt(formValues.team_id),
                season_id: seasonId,
                jersey_number: formValues.jersey_number || null
              }).subscribe({
                next: () => {
                  Swal.fire('¡Actualizado!', 'Datos y equipo guardados correctamente.', 'success');
                  this.loadPlayers();
                },
                error: (err) => {
                  Swal.fire('Error', err.error.message || 'Error al inscribir en el equipo.', 'error');
                  this.loadPlayers();
                }
              });
            } else if (player.team_id) {
              // Si antes tenía equipo y ahora no, dar de baja (opcional, podrías querer mantenerlo)
              this.apiService.unregisterPlayerFromTeam(player.id, {
                team_id: player.team_id,
                season_id: seasonId
              }).subscribe({
                next: () => {
                  Swal.fire('¡Actualizado!', 'Jugador ahora sin equipo para esta temporada.', 'success');
                  this.loadPlayers();
                }
              });
            } else {
              Swal.fire('¡Actualizado!', 'Datos guardados correctamente.', 'success');
              this.loadPlayers();
            }
          }
        },
        error: (err) => Swal.fire('Error', 'No se pudo actualizar', 'error')
      });
    }
  }

  deletePlayer(player: any) {
    const seasonId = this.seasonService.currentSeasonId();

    if (!seasonId) {
      Swal.fire('Atención', 'Debes seleccionar una temporada para realizar esta acción.', 'warning');
      return;
    }

    const secondaryColor = getComputedStyle(document.documentElement).getPropertyValue('--secundario').trim() || '#f7941d';

    Swal.fire({
      title: '¿Quitar de la temporada?',
      text: `Vas a dar de baja a ${player.name} en esta temporada. Sus estadísticas y su ficha se mantendrán en el sistema global.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: secondaryColor,
      confirmButtonText: 'Sí, quitar',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        this.apiService.removePlayerFromSeason(player.id, seasonId).subscribe({
          next: () => {
            Swal.fire('¡Quitado!', 'El jugador ya no pertenece a esta temporada.', 'success');
            this.loadPlayers();
          },
          error: (err) => Swal.fire('Error', 'No se pudo quitar al jugador de la temporada', 'error')
        });
      }
    });
  }

  deletePlayerPermanent(player: any) {
    Swal.fire({
      title: '¿BORRADO DEFINITIVO?',
      text: `¿Estás seguro de que quieres borrar a ${player.name} de forma PERMANENTE? Se borrará también su foto de la nube y no se podrá recuperar. Solo funcionará si no tiene historial de goles o tarjetas.`,
      icon: 'error',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'SÍ, BORRAR PARA SIEMPRE',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        Swal.showLoading();
        this.apiService.deletePlayerPermanent(player.id).subscribe({
          next: (res) => {
            Swal.fire('¡Borrado!', res.message, 'success');
            this.loadPlayers();
          },
          error: (err) => {
            Swal.fire('No se pudo borrar', err.error.message || 'Error desconocido', 'error');
          }
        });
      }
    });
  }
}
