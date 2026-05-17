import { Component, inject, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../../services/api-service';
import { SeasonService } from '../../../services/season-service';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-teams',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './teams.html',
  styleUrl: './teams.css',
})
export class Teams implements OnInit {
  private apiService = inject(ApiService);
  private seasonService = inject(SeasonService);
  private route = inject(ActivatedRoute);

  teams: any[] = [];
  pagination = {
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  };
  searchTerm: string = '';

  constructor() {
    effect(() => {
      const seasonId = this.seasonService.currentSeasonId();
      if (seasonId) {
        this.pagination.page = 1;
        this.loadTeams();
      }
    });
  }

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params['search']) {
        this.searchTerm = params['search'];
        this.loadTeams();
      }
    });
  }

  loadTeams() {
    const seasonId = this.seasonService.currentSeasonId();
    this.apiService.getTeams(
      seasonId || undefined,
      this.pagination.page,
      this.pagination.limit,
      this.searchTerm
    ).subscribe({
      next: (res) => {
        this.teams = res.teams;
        this.pagination = res.pagination;
      },
      error: (err) => console.error('Error cargando equipos', err)
    });
  }

  onSearch() {
    this.pagination.page = 1;
    this.loadTeams();
  }

  changePage(newPage: number) {
    if (newPage >= 1 && newPage <= this.pagination.totalPages) {
      this.pagination.page = newPage;
      this.loadTeams();
    }
  }

  /**
   * Abre un modal para ver los jugadores del equipo en la temporada actual
   * y permite editar sus dorsales.
   */
  async openSquadModal(team: any) {
    const seasonId = this.seasonService.currentSeasonId();
    if (!seasonId) return;

    const secondaryColor = getComputedStyle(document.documentElement).getPropertyValue('--secundario').trim() || '#f7941d';

    Swal.fire({
      title: `Plantilla - ${team.name}`,
      html: `
        <div id="squad-loader" class="p-4 text-center">
          <i class="fas fa-spinner fa-spin fa-2x" style="color: var(--primario);"></i>
          <p class="mt-2">Cargando jugadores...</p>
        </div>
        <div id="squad-container"></div>
      `,
      showConfirmButton: false,
      showCloseButton: true,
      width: '700px',
      didOpen: () => {
        this.apiService.getTeamPlayers(team.id, seasonId).subscribe(players => {
          const loader = document.getElementById('squad-loader');
          if (loader) loader.style.display = 'none';

          const container = document.getElementById('squad-container');
          if (!container) return;

          if (players.length === 0) {
            container.innerHTML = `
              <div class="p-5 text-center">
                <i class="fas fa-users-slash fa-3x text-muted mb-3"></i>
                <p class="text-muted">No hay jugadores inscritos en este equipo para esta temporada.</p>
              </div>
            `;
            return;
          }

          const tableHtml = `
            <div class="table-responsive p-2">
              <table class="admin-table">
                <thead>
                  <tr>
                    <th>Foto</th>
                    <th>Nombre</th>
                    <th>Dorsal</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  ${players.map(p => `
                    <tr>
                      <td>
                        <img src="${p.photo_url || '/images/default-player.webp'}" 
                             class="player-photo-small">
                      </td>
                      <td class="text-start"><strong>${p.name}</strong></td>
                      <td>
                        <input type="text" id="dorsal-${p.id}" class="swal-input-custom" value="${p.jersey_number || ''}" style="width: 70px !important; text-align: center;">
                      </td>
                      <td>
                        <button class="btn-icon edit btn-save-dorsal" data-player-id="${p.id}" title="Guardar Dorsal">
                          <i class="fas fa-save"></i>
                        </button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `;
          container.innerHTML = tableHtml;

          // Añadir eventos a los botones de guardado
          container.querySelectorAll('.btn-save-dorsal').forEach(btn => {
            btn.addEventListener('click', () => {
              const playerId = (btn as HTMLElement).getAttribute('data-player-id');
              const dorsalInput = document.getElementById(`dorsal-${playerId}`) as HTMLInputElement;
              const jerseyNumber = dorsalInput.value;

              if (playerId) {
                this.apiService.registerPlayer({
                  player_id: parseInt(playerId),
                  team_id: team.id,
                  season_id: seasonId,
                  jersey_number: jerseyNumber || null
                }).subscribe({
                  next: () => {
                    Swal.showValidationMessage('Dorsal guardado');
                    setTimeout(() => Swal.resetValidationMessage(), 2000);
                  },
                  error: (err) => {
                    Swal.showValidationMessage(err.error.message || 'Error al guardar');
                  }
                });
              }
            });
          });
        });
      }
    });
  }


  async openAddExistingModal() {
    const seasonId = this.seasonService.currentSeasonId();
    if (!seasonId) {
      Swal.fire('Error', 'Debes seleccionar una temporada primero', 'error');
      return;
    }

    const secondaryColor = getComputedStyle(document.documentElement).getPropertyValue('--secundario').trim() || '#f7941d';

    let selectedTeamId: number | null = null;

    const { value: confirmed } = await Swal.fire({
      title: 'Fichar Equipo Existente',
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
            object-fit: contain !important;
            margin-right: 15px !important;
            border: 2px solid #eee !important;
            background: white;
            padding: 4px;
          }
          .player-info-meta { text-align: left; flex: 1; }
          .player-info-meta strong { display: block; color: #333; font-size: 1rem; }
          .player-info-meta span { color: #888; font-size: 0.75rem; }
        </style>
        <div class="swal-form">
          <p class="text-muted small mb-3">Busca un equipo que haya participado en otras temporadas para traerlo a la actual.</p>
          
          <div class="swal-field">
            <div class="search-container-swal">
              <input id="swal-team-search" class="swal-input-custom" placeholder="Escribe el nombre del equipo..." autocomplete="off">
              <div id="swal-search-results" class="existing-results-container" style="display: none;"></div>
            </div>
          </div>

          <div id="team-selection-info" style="display: none;" class="mt-3 p-3 border-top bg-light rounded">
            <h5 id="selected-team-name" class="mb-3 text-primary"></h5>
            <div class="d-flex align-items-center gap-3 mb-3">
              <img id="selected-team-logo" src="" class="mini-photo" style="width: 50px; height: 50px; border-radius: 50%; object-fit: contain; background: white; border: 1px solid #ddd;">
              <span class="text-muted">Equipo seleccionado para inscribir</span>
            </div>
            <button id="btn-confirm-team-add" class="btn-primary w-100 mt-2" style="justify-content: center;">Confirmar Inscripción</button>
          </div>
        </div>
      `,
      showCancelButton: true,
      showConfirmButton: false,
      cancelButtonText: 'Cerrar',
      didOpen: () => {
        const searchInput = document.getElementById('swal-team-search') as HTMLInputElement;
        const resultsContainer = document.getElementById('swal-search-results') as HTMLElement;
        const selectionInfo = document.getElementById('team-selection-info') as HTMLElement;

        searchInput.addEventListener('input', () => {
          const query = searchInput.value;
          if (query.length < 2) {
            resultsContainer.style.display = 'none';
            return;
          }

          this.apiService.getTeams(undefined, 1, 50, query, seasonId).subscribe({
            next: (res) => {
              const availableTeams = res.teams;
              if (availableTeams.length === 0) {
                resultsContainer.innerHTML = '<p class="text-center p-3 text-muted">No se encontraron equipos disponibles.</p>';
              } else {
                resultsContainer.innerHTML = availableTeams.map((t: any) => `
                  <div class="player-search-item" data-id="${t.id}" data-name="${t.name}" data-logo="${t.logo_url}">
                    <img src="${t.logo_url || 'https://res.cloudinary.com/dyxl1d54d/image/upload/tfg_futsal/general/logogenericoequipo.webp'}" class="mini-photo">
                    <div class="player-info-meta">
                      <strong>${t.name}</strong>
                      <span style="font-size: 0.75rem; color: #777;">${t.coach || 'Sin entrenador'}</span>
                    </div>
                    <i class="fas fa-chevron-right" style="color: #ccc;"></i>
                  </div>
                `).join('');
              }
              resultsContainer.style.display = 'block';

              // Eventos de selección
              resultsContainer.querySelectorAll('.player-search-item').forEach(item => {
                item.addEventListener('click', () => {
                  selectedTeamId = Number(item.getAttribute('data-id'));
                  const name = item.getAttribute('data-name');
                  const logo = item.getAttribute('data-logo');

                  (document.getElementById('selected-team-name') as HTMLElement).innerText = name || '';
                  (document.getElementById('selected-team-logo') as HTMLImageElement).src = logo || 'https://res.cloudinary.com/dyxl1d54d/image/upload/tfg_futsal/general/logogenericoequipo.webp';
                  
                  selectionInfo.style.display = 'block';
                  resultsContainer.style.display = 'none';
                  searchInput.value = name || '';
                });
              });
            }
          });
        });

        // Confirmar inscripción
        document.getElementById('btn-confirm-team-add')?.addEventListener('click', () => {
          if (!selectedTeamId) return;
          
          Swal.showLoading();
          this.apiService.registerTeam(selectedTeamId, seasonId).subscribe({
            next: () => {
              Swal.fire('¡Inscrito!', 'El equipo ha sido incorporado a la temporada.', 'success');
              this.loadTeams();
            },
            error: (err) => {
              Swal.fire('Error', err.error?.message || 'No se pudo inscribir al equipo', 'error');
            }
          });
        });
      }
    });
  }

  /**
   * Abre el modal para crear un equipo, con soporte para subir logo a Cloudinary.
   */
  async openCreateModal() {
    let uploadedLogoUrl = '';

    const secondaryColor = getComputedStyle(document.documentElement).getPropertyValue('--secundario').trim() || '#f7941d';

    const { value: formValues } = await Swal.fire({
      title: 'Crear Nuevo Equipo',
      html: `
        <div class="swal-form">
          <div class="swal-field">
            <label>Nombre del Equipo</label>
            <input id="swal-name" class="swal-input-custom" placeholder="Nombre oficial">
          </div>
          <div class="swal-field">
            <label>Color de la Equipación</label>
            <input id="swal-color" class="swal-input-custom" placeholder="Ej: Blanco/Rojo">
          </div>
          <div class="swal-field">
            <label>Delegado</label>
            <input id="swal-delegate" class="swal-input-custom" placeholder="Nombre del delegado">
          </div>
          <div class="swal-field">
            <label>Entrenador</label>
            <input id="swal-coach" class="swal-input-custom" placeholder="Nombre del entrenador">
          </div>
          <div class="swal-field">
            <label>Teléfono de contacto</label>
            <input id="swal-phone" class="swal-input-custom" placeholder="Teléfono/Móvil">
          </div>
          <div class="swal-file-container">
            <label for="swal-file">
              <i class="fas fa-cloud-upload-alt"></i> Subir Logo
            </label>
            <input type="file" id="swal-file" hidden accept="image/*">
            <div id="swal-preview" class="image-preview"></div>
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Crear Equipo',
      cancelButtonText: 'Cancelar',
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

          this.apiService.getTeams(undefined, 1, 5, query).subscribe({
            next: (res) => {
              if (res.teams.length > 0) {
                duplicateWarn.innerHTML = `
                  <i class="fas fa-exclamation-triangle"></i> 
                  <strong>¡Atención!</strong> Ya existe un equipo con este nombre. 
                  Usa "Añadir Existente" si es el mismo.
                `;
                duplicateWarn.style.display = 'block';
              } else {
                duplicateWarn.style.display = 'none';
              }
            }
          });
        });

        const fileInput = document.getElementById('swal-file') as HTMLInputElement;
        const preview = document.getElementById('swal-preview') as HTMLElement;

        fileInput.addEventListener('change', (e: any) => {
          const file = e.target.files[0];
          if (file) {
            // Mostrar previsualización local
            const reader = new FileReader();
            reader.onload = (event: any) => {
              preview.innerHTML = `<img src="${event.target.result}" style="max-width: 100px; margin-top: 10px; border-radius: 8px;">`;
            };
            reader.readAsDataURL(file);

            // Subir a Cloudinary inmediatamente
            Swal.showLoading();
            const teamName = (document.getElementById('swal-name') as HTMLInputElement).value;
            this.apiService.uploadImage(file, 'teams', teamName).subscribe({
              next: (res) => {
                uploadedLogoUrl = res.url;
                Swal.hideLoading();
              },
              error: () => {
                Swal.fire('Error', 'No se pudo subir la imagen', 'error');
              }
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
          kit_color: (document.getElementById('swal-color') as HTMLInputElement).value,
          delegate: (document.getElementById('swal-delegate') as HTMLInputElement).value,
          coach: (document.getElementById('swal-coach') as HTMLInputElement).value,
          phone: (document.getElementById('swal-phone') as HTMLInputElement).value,
          logo_url: uploadedLogoUrl
        };
      }
    });

    if (formValues) {
      const seasonId = this.seasonService.currentSeasonId();
      const teamToCreate = { ...formValues, season_id: seasonId };

      Swal.showLoading();
      this.apiService.createTeam(teamToCreate).subscribe({
        next: () => {
          Swal.fire('¡Creado!', 'El equipo ha sido creado correctamente.', 'success');
          this.loadTeams();
        },
        error: (err) => Swal.fire('Error', err.error.message || 'No se pudo crear', 'error')
      });
    }
  }

  async openEditModal(team: any) {
    let uploadedLogoUrl = team.logo_url;

    const secondaryColor = getComputedStyle(document.documentElement).getPropertyValue('--secundario').trim() || '#f7941d';

    const { value: formValues } = await Swal.fire({
      title: 'Editar Equipo',
      html: `
        <div class="swal-form">
          <div class="swal-field">
            <label>Nombre</label>
            <input id="swal-name" class="swal-input-custom" placeholder="Nombre" value="${team.name}">
          </div>
          <div class="swal-field">
            <label>Color</label>
            <input id="swal-color" class="swal-input-custom" placeholder="Color" value="${team.kit_color || ''}">
          </div>
          <div class="swal-field">
            <label>Delegado</label>
            <input id="swal-delegate" class="swal-input-custom" placeholder="Delegado" value="${team.delegate || ''}">
          </div>
          <div class="swal-field">
            <label>Entrenador</label>
            <input id="swal-coach" class="swal-input-custom" placeholder="Entrenador" value="${team.coach || ''}">
          </div>
          <div class="swal-field">
            <label>Teléfono de contacto</label>
            <input id="swal-phone" class="swal-input-custom" placeholder="Teléfono" value="${team.phone || ''}">
          </div>
          
          <div class="swal-file-container">
            <label for="swal-file">
              <i class="fas fa-camera"></i> Cambiar Logo
            </label>
            <input type="file" id="swal-file" hidden accept="image/*">
            <div id="swal-preview" class="image-preview">
              ${team.logo_url ? `<img src="${team.logo_url}" style="border-radius: 8px;">` : ''}
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
        const preview = document.getElementById('swal-preview') as HTMLElement;

        fileInput.addEventListener('change', (e: any) => {
          const file = e.target.files[0];
          if (file) {
            Swal.showLoading();
            const teamName = (document.getElementById('swal-name') as HTMLInputElement).value;
            this.apiService.uploadImage(file, 'teams', teamName || team.name).subscribe({
              next: (res) => {
                uploadedLogoUrl = res.url;
                preview.innerHTML = `<img src="${res.url}" style="max-width: 100px; margin-top: 10px; border-radius: 8px;">`;
                Swal.hideLoading();
              },
              error: () => Swal.fire('Error', 'No se pudo subir la imagen', 'error')
            });
          }
        });
      },
      preConfirm: () => {
        return {
          name: (document.getElementById('swal-name') as HTMLInputElement).value,
          kit_color: (document.getElementById('swal-color') as HTMLInputElement).value,
          logo_url: uploadedLogoUrl,
          delegate: (document.getElementById('swal-delegate') as HTMLInputElement).value,
          coach: (document.getElementById('swal-coach') as HTMLInputElement).value,
          phone: (document.getElementById('swal-phone') as HTMLInputElement).value
        };
      }
    });

    if (formValues) {
      Swal.showLoading();
      this.apiService.updateTeam(team.id, formValues).subscribe({
        next: () => {
          Swal.fire('¡Actualizado!', 'El equipo se ha actualizado correctamente.', 'success');
          this.loadTeams();
        },
        error: (err) => Swal.fire('Error', 'No se pudo actualizar', 'error')
      });
    }
  }

  deleteTeam(team: any) {
    const seasonId = this.seasonService.currentSeasonId();

    if (!seasonId) {
      Swal.fire('Atención', 'Debes seleccionar una temporada para realizar esta acción.', 'warning');
      return;
    }

    const secondaryColor = getComputedStyle(document.documentElement).getPropertyValue('--secundario').trim() || '#f7941d';

    Swal.fire({
      title: '¿Quitar de la temporada?',
      text: `Vas a dar de baja al equipo ${team.name} en esta temporada. Sus estadísticas históricas y su logo se mantendrán en el sistema global.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: secondaryColor,
      confirmButtonText: 'Sí, quitar',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        this.apiService.removeTeamFromSeason(team.id, seasonId).subscribe({
          next: () => {
            Swal.fire('¡Quitado!', 'El equipo ya no pertenece a esta temporada.', 'success');
            this.loadTeams();
          },
          error: (err) => Swal.fire('Error', 'No se pudo quitar al equipo de la temporada', 'error')
        });
      }
    });
  }

  deleteTeamPermanent(team: any) {
    Swal.fire({
      title: '¿BORRADO DEFINITIVO?',
      text: `¿Estás seguro de que quieres borrar el equipo ${team.name} de forma PERMANENTE? Se borrará también su logo de la nube y no se podrá recuperar. Solo funcionará si no tiene historial de partidos.`,
      icon: 'error',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'SÍ, BORRAR PARA SIEMPRE',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        Swal.showLoading();
        this.apiService.deleteTeamPermanent(team.id).subscribe({
          next: (res) => {
            Swal.fire('¡Borrado!', res.message, 'success');
            this.loadTeams();
          },
          error: (err) => {
            Swal.fire('No se pudo borrar', err.error.message || 'Error desconocido', 'error');
          }
        });
      }
    });
  }
}
