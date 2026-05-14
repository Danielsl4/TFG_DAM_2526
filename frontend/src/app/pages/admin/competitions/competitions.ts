import { Component, OnInit, inject, effect, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../services/api-service';
import { SeasonService } from '../../../services/season-service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-competitions',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './competitions.html',
  styleUrl: './competitions.css'
})
export class Competitions implements OnInit {
  private apiService = inject(ApiService);
  private seasonService = inject(SeasonService);

  @ViewChild('tabsContainer') tabsContainer!: ElementRef;

  activeTab: 'seasons' | 'groups' | 'fields' | 'matches' = 'seasons';

  seasons: any[] = [];
  groups: any[] = [];
  fields: any[] = [];
  matches: any[] = [];

  loading = {
    seasons: false,
    groups: false,
    fields: false,
    matches: false
  };

  matchSearchTerm: string = '';
  matchPagination = {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0
  };

  constructor() {
    // Recargar datos cuando cambie la temporada en el selector flotante
    effect(() => {
      const seasonId = this.seasonService.currentSeasonId();
      if (seasonId) {
        this.loadGroups();
        this.loadMatches();
      }
    });
  }

  ngOnInit(): void {
    this.loadSeasons();
    this.loadFields();
  }

  loadMatches() {
    this.loading.matches = true;
    const seasonId = this.seasonService.currentSeasonId();
    this.apiService.getMatches(seasonId || undefined).subscribe({
      next: (data) => {
        this.matches = data;
        this.updateMatchPagination();
        this.loading.matches = false;
      },
      error: () => this.loading.matches = false
    });
  }

  updateMatchPagination() {
    const filtered = this.filteredMatches;
    this.matchPagination.total = filtered.length;
    this.matchPagination.totalPages = Math.ceil(filtered.length / this.matchPagination.limit);
    if (this.matchPagination.page > this.matchPagination.totalPages && this.matchPagination.totalPages > 0) {
      this.matchPagination.page = this.matchPagination.totalPages;
    }
  }

  get filteredMatches() {
    if (!this.matchSearchTerm) return this.matches;
    const term = this.matchSearchTerm.toLowerCase();
    return this.matches.filter(m =>
      (m.homeTeam?.name?.toLowerCase().includes(term)) ||
      (m.awayTeam?.name?.toLowerCase().includes(term)) ||
      (m.homeTeamPlaceholder?.toLowerCase().includes(term)) ||
      (m.awayTeamPlaceholder?.toLowerCase().includes(term)) ||
      (m.groupName?.toLowerCase().includes(term)) ||
      (m.phase?.toLowerCase().includes(term))
    );
  }

  get paginatedMatches() {
    const start = (this.matchPagination.page - 1) * this.matchPagination.limit;
    return this.filteredMatches.slice(start, start + this.matchPagination.limit);
  }

  changeMatchPage(newPage: number) {
    if (newPage >= 1 && newPage <= this.matchPagination.totalPages) {
      this.matchPagination.page = newPage;
    }
  }

  onMatchSearch() {
    this.matchPagination.page = 1;
    this.updateMatchPagination();
  }

  scrollTabs(amount: number) {
    if (this.tabsContainer) {
      this.tabsContainer.nativeElement.scrollBy({
        left: amount,
        behavior: 'smooth'
      });
    }
  }

  // --- TEMPORADAS ---
  loadSeasons() {
    this.loading.seasons = true;
    this.apiService.getSeasons().subscribe({
      next: (data) => {
        this.seasons = data;
        this.loading.seasons = false;
      },
      error: () => this.loading.seasons = false
    });
  }

  async openSeasonModal(season?: any) {
    const secondaryColor = getComputedStyle(document.documentElement).getPropertyValue('--secundario').trim() || '#f7941d';

    const { value: formValues } = await Swal.fire({
      title: season ? 'Editar Temporada' : 'Nueva Temporada',
      html: `
        <div class="swal-form">
          <div class="swal-field">
            <label>Nombre de la Temporada</label>
            <input id="swal-name" class="swal-input-custom" placeholder="Ej: Temporada 20XX" value="${season?.name || ''}">
          </div>
          <div class="swal-field">
            <label>Fecha de Inicio</label>
            <input id="swal-start" type="date" class="swal-input-custom" value="${season?.start_date ? new Date(season.start_date).toISOString().split('T')[0] : ''}">
          </div>
          <div class="swal-field">
            <label>Fecha de Fin</label>
            <input id="swal-end" type="date" class="swal-input-custom" value="${season?.end_date ? new Date(season.end_date).toISOString().split('T')[0] : ''}">
          </div>
          ${!season ? `
          <div class="swal-field">
            <label>Importar de Temporada Anterior (Opcional)</label>
            <select id="swal-import" class="swal-select-custom">
              <option value="">-- No importar (Vacía) --</option>
              ${this.seasons.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
            </select>
            <small class="text-muted">Se copiarán grupos, equipos y plantillas automáticamente.</small>
          </div>
          ` : ''}
          <div class="swal-field" style="flex-direction: row; align-items: center; gap: 10px; margin-top: 5px;">
            <input type="checkbox" id="swal-active" ${season?.is_active ? 'checked' : ''} style="width: 20px; height: 20px; cursor: pointer;">
            <label for="swal-active" style="cursor: pointer; margin: 0;">Temporada Activa</label>
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: season ? 'Guardar Cambios' : 'Crear e Importar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: secondaryColor,
      preConfirm: () => {
        const name = (document.getElementById('swal-name') as HTMLInputElement).value;
        if (!name) {
          Swal.showValidationMessage('El nombre es obligatorio');
          return false;
        }
        return {
          name,
          start_date: (document.getElementById('swal-start') as HTMLInputElement).value || null,
          end_date: (document.getElementById('swal-end') as HTMLInputElement).value || null,
          is_active: (document.getElementById('swal-active') as HTMLInputElement).checked,
          import_from: !season ? (document.getElementById('swal-import') as HTMLSelectElement).value : null
        };
      }
    });

    if (formValues) {
      if (season) {
        this.apiService.updateSeason(season.id, formValues).subscribe(() => {
          this.loadSeasons();
          Swal.fire('¡Éxito!', 'Temporada actualizada', 'success');
        });
      } else {
        this.apiService.createSeason(formValues).subscribe({
          next: () => {
            this.loadSeasons();
            Swal.fire('¡Éxito!', 'Temporada creada e importada correctamente', 'success');
          },
          error: (err) => {
            Swal.fire('Error', err.error?.message || 'No se pudo crear la temporada', 'error');
          }
        });
      }
    }
  }

  async openImportModal(targetSeasonId: number) {
    const otherSeasons = this.seasons.filter(s => s.id !== targetSeasonId);

    if (otherSeasons.length === 0) {
      Swal.fire('Info', 'No hay otras temporadas para importar datos.', 'info');
      return;
    }

    const { value: fromId } = await Swal.fire({
      title: 'Seleccionar Origen',
      input: 'select',
      inputOptions: Object.fromEntries(otherSeasons.map(s => [s.id, s.name])),
      inputPlaceholder: 'Elige una temporada...',
      showCancelButton: true,
      confirmButtonText: 'Importar Ahora',
      cancelButtonText: 'Cancelar'
    });

    if (fromId) {
      Swal.fire({
        title: 'Importando...',
        didOpen: () => {
          Swal.showLoading();
          this.apiService.importSeasonStructure(targetSeasonId, parseInt(fromId)).subscribe({
            next: (res) => {
              Swal.fire('¡Éxito!', `Se han importado ${res.groupsImported} grupos con sus equipos y jugadores.`, 'success');
              this.loadGroups();
              this.loadMatches();
            },
            error: (err) => {
              Swal.fire('Error', err.error?.message || 'Error al importar datos', 'error');
            }
          });
        }
      });
    }
  }

  deleteSeason(id: number) {
    Swal.fire({
      title: '¿Estás seguro?',
      text: "Se borrarán todos los grupos y partidos asociados.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, borrar',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        this.apiService.deleteSeason(id).subscribe({
          next: () => {
            this.loadSeasons();
            Swal.fire('Borrado', 'La temporada ha sido eliminada', 'success');
          },
          error: (err) => Swal.fire('Error', err.error.message || 'No se pudo eliminar', 'error')
        });
      }
    });
  }

  // --- GRUPOS ---
  loadGroups() {
    this.loading.groups = true;
    const seasonId = this.seasonService.currentSeasonId();
    this.apiService.getGroups(seasonId || undefined).subscribe({
      next: (data) => {
        this.groups = data;
        this.loading.groups = false;
      },
      error: () => this.loading.groups = false
    });
  }

  async openGroupModal(group?: any) {
    const seasonOptions = this.seasons.map(s => `<option value="${s.id}" ${group?.season_id === s.id ? 'selected' : ''}>${s.name}</option>`).join('');

    const { value: formValues } = await Swal.fire({
      title: group ? 'Editar Grupo' : 'Nuevo Grupo',
      html: `
        <div class="swal-form">
          <div class="swal-field">
            <label>Nombre del Grupo</label>
            <input id="swal-name" class="swal-input-custom" placeholder="Nombre (ej: Grupo A)" value="${group?.name || ''}">
          </div>
          <div class="swal-field">
            <label>Temporada</label>
            <select id="swal-season" class="swal-select-custom">
              ${seasonOptions}
            </select>
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: 'var(--secundario)',
      preConfirm: () => {
        const name = (document.getElementById('swal-name') as HTMLInputElement).value;
        const season_id = (document.getElementById('swal-season') as HTMLSelectElement).value;
        if (!name || !season_id) {
          Swal.showValidationMessage('Todos los campos son obligatorios');
          return false;
        }
        return { name, season_id: parseInt(season_id) };
      }
    });

    if (formValues) {
      if (group) {
        this.apiService.updateGroup(group.id, formValues).subscribe(() => {
          this.loadGroups();
          Swal.fire('¡Éxito!', 'Grupo actualizado', 'success');
        });
      } else {
        this.apiService.createGroup(formValues).subscribe(() => {
          this.loadGroups();
          Swal.fire('¡Éxito!', 'Grupo creado', 'success');
        });
      }
    }
  }

  deleteGroup(id: number) {
    Swal.fire({
      title: '¿Borrar grupo?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Borrar'
    }).then((result) => {
      if (result.isConfirmed) {
        this.apiService.deleteGroup(id).subscribe({
          next: () => {
            this.loadGroups();
            Swal.fire('Borrado', 'El grupo ha sido eliminado', 'success');
          },
          error: (err) => Swal.fire('Error', err.error.message || 'No se pudo eliminar', 'error')
        });
      }
    });
  }

  async manageGroupTeams(group: any) {
    this.loading.groups = true;

    // 1. Obtener equipos actuales del grupo
    this.apiService.getGroupTeams(group.id).subscribe({
      next: async (currentTeams) => {
        // 2. Obtener equipos para poder añadir (pedimos un límite alto para que salgan todos)
        this.apiService.getTeams(undefined, 1, 100).subscribe({
          next: async (res) => {
            this.loading.groups = false;
            const allTeams = res.teams || [];

            const teamOptions = allTeams
              .filter((at: any) => !currentTeams.find((ct: any) => ct.id === at.id))
              .map((t: any) => `<option value="${t.id}">${t.name}</option>`).join('');

            const currentTeamsList = currentTeams.map(t => `
              <div class="d-flex justify-content-between align-items-center mb-2 p-2 border rounded">
                <span>${t.name}</span>
                <button class="btn btn-sm btn-outline-danger btn-remove-team" data-id="${t.id}">
                  <i class="fas fa-times"></i>
                </button>
              </div>
            `).join('') || '<p class="text-muted">No hay equipos en este grupo</p>';

            const { value: action } = await Swal.fire({
              title: `Equipos en ${group.name}`,
              html: `
                <div class="text-start mb-3">
                  <h6>Equipos actuales:</h6>
                  <div id="current-teams-container">${currentTeamsList}</div>
                </div>
                <div class="text-start">
                  <h6>Añadir equipo:</h6>
                  <div class="d-flex gap-2">
                    <select id="swal-new-team" class="form-select">
                      <option value="">Seleccionar equipo...</option>
                      ${teamOptions}
                    </select>
                    <button id="btn-add-team" class="btn btn-primary"><i class="fas fa-plus"></i></button>
                  </div>
                </div>
              `,
              showConfirmButton: false,
              showCloseButton: true,
              width: '500px',
              didOpen: () => {
                // Manejar borrado
                const container = document.getElementById('current-teams-container');
                container?.addEventListener('click', (e) => {
                  const btn = (e.target as HTMLElement).closest('.btn-remove-team');
                  if (btn) {
                    const teamId = btn.getAttribute('data-id');
                    if (teamId) {
                      this.apiService.removeGroupTeam(group.id, parseInt(teamId), group.season_id).subscribe(() => {
                        Swal.close();
                        this.manageGroupTeams(group); // Recargar
                      });
                    }
                  }
                });

                // Manejar añadido
                const btnAdd = document.getElementById('btn-add-team');
                btnAdd?.addEventListener('click', () => {
                  const teamId = (document.getElementById('swal-new-team') as HTMLSelectElement).value;
                  if (teamId) {
                    this.apiService.addGroupTeam(group.id, parseInt(teamId), group.season_id).subscribe(() => {
                      Swal.close();
                      this.manageGroupTeams(group); // Recargar
                    });
                  }
                });
              }
            });
          }
        });
      },
      error: () => this.loading.groups = false
    });
  }

  // --- CAMPOS ---
  loadFields() {
    this.loading.fields = true;
    this.apiService.getFields().subscribe({
      next: (data) => {
        this.fields = data;
        this.loading.fields = false;
      },
      error: () => this.loading.fields = false
    });
  }

  async openFieldModal(field?: any) {
    const { value: formValues } = await Swal.fire({
      title: field ? 'Editar Campo' : 'Nuevo Campo',
      html: `
        <div class="swal-form">
          <div class="swal-field">
            <label>Nombre del Campo</label>
            <input id="swal-name" class="swal-input-custom" placeholder="Nombre (ej: Pista Central)" value="${field?.name || ''}">
          </div>
          <div class="swal-field">
            <label>Ubicación / Dirección</label>
            <input id="swal-loc" class="swal-input-custom" placeholder="Ubicación (ej: Polideportivo Municipal)" value="${field?.location || ''}">
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: 'var(--secundario)',
      preConfirm: () => {
        const name = (document.getElementById('swal-name') as HTMLInputElement).value;
        if (!name) {
          Swal.showValidationMessage('El nombre es obligatorio');
          return false;
        }
        return { name, location: (document.getElementById('swal-loc') as HTMLInputElement).value };
      }
    });

    if (formValues) {
      if (field) {
        this.apiService.updateField(field.id, formValues).subscribe(() => {
          this.loadFields();
          Swal.fire('¡Éxito!', 'Campo actualizado', 'success');
        });
      } else {
        this.apiService.createField(formValues).subscribe(() => {
          this.loadFields();
          Swal.fire('¡Éxito!', 'Campo creado', 'success');
        });
      }
    }
  }

  deleteField(id: number) {
    const errorColor = getComputedStyle(document.documentElement).getPropertyValue('--error').trim() || '#ef4444';
    
    Swal.fire({
      title: '¿Mover a la papelera?',
      text: 'El campo dejará de estar disponible para nuevos partidos, pero se mantendrá en el historial.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: errorColor,
      confirmButtonText: 'Sí, mover',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        this.apiService.deleteField(id).subscribe({
          next: () => {
            this.loadFields();
            Swal.fire('¡Enviado!', 'El campo se ha movido a la papelera.', 'success');
          },
          error: (err) => Swal.fire('Error', err.error.message || 'No se pudo eliminar', 'error')
        });
      }
    });
  }

  async openFieldsTrashModal() {
    Swal.fire({
      title: 'Papelera de Campos',
      html: `
        <div id="trash-loader" class="p-4 text-center">
          <i class="fas fa-spinner fa-spin fa-2x" style="color: var(--primario);"></i>
        </div>
        <div id="trash-container"></div>
      `,
      showConfirmButton: false,
      showCloseButton: true,
      width: '600px',
      didOpen: () => {
        this.apiService.getFieldsTrash().subscribe({
          next: (fields) => {
            const loader = document.getElementById('trash-loader');
            if (loader) loader.style.display = 'none';

            const container = document.getElementById('trash-container');
            if (!container) return;

            if (fields.length === 0) {
              container.innerHTML = '<div class="p-4 text-center text-muted">No hay campos en la papelera.</div>';
              return;
            }

            container.innerHTML = `
              <div class="table-responsive">
                <table class="admin-table">
                  <thead><tr><th>Nombre</th><th>Acción</th></tr></thead>
                  <tbody>
                    ${fields.map(f => `
                      <tr>
                        <td class="text-start">${f.name}</td>
                        <td>
                          <div class="d-flex justify-content-center gap-2">
                            <button class="btn-icon manage btn-restore-field" data-id="${f.id}" title="Restaurar">
                              <i class="fas fa-trash-restore"></i>
                            </button>
                            <button class="btn-icon delete btn-permanent-delete-field" data-id="${f.id}" title="Eliminar Definitivamente">
                              <i class="fas fa-times-circle"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `;

            container.querySelectorAll('.btn-restore-field').forEach(btn => {
              btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                if (id) {
                  this.apiService.restoreField(parseInt(id)).subscribe(() => {
                    Swal.fire('Restaurado', 'Campo recuperado correctamente', 'success');
                    this.loadFields();
                    this.openFieldsTrashModal();
                  });
                }
              });
            });

            // Eventos para eliminar definitivamente
            container.querySelectorAll('.btn-permanent-delete-field').forEach(btn => {
              btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                if (id) {
                  Swal.fire({
                    title: '¿Eliminar para siempre?',
                    text: 'Esta acción borrará el campo definitivamente. Los partidos antiguos que lo usaran se quedarán sin campo.',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Sí, borrar para siempre',
                    confirmButtonColor: '#d33',
                    cancelButtonText: 'Cancelar'
                  }).then((result) => {
                    if (result.isConfirmed) {
                      this.apiService.deletePermanentField(parseInt(id)).subscribe({
                        next: () => {
                          Swal.fire('¡Borrado!', 'El campo ha sido eliminado definitivamente.', 'success');
                          this.loadFields();
                          this.openFieldsTrashModal();
                        },
                        error: (err) => Swal.fire('Error', err.error.message || 'No se pudo eliminar', 'error')
                      });
                    }
                  });
                }
              });
            });
          }
        });
      }
    });
  }

  async openMatchModal() {
    const seasonId = this.seasonService.currentSeasonId();
    if (!seasonId) {
      Swal.fire('Error', 'Debes seleccionar una temporada en el selector flotante primero.', 'error');
      return;
    }

    if (this.groups.length === 0 || this.fields.length === 0) {
      Swal.fire('Atención', 'Necesitas tener al menos un grupo y un campo creados.', 'warning');
      return;
    }

    const { value: formValues } = await Swal.fire({
      title: 'Crear Nuevo Partido',
      width: '450px',
      html: `
        <div class="swal-form text-start" style="gap: 10px;">
          <div>
            <label class="small fw-bold mb-1 d-block">1. Configuración de Fase</label>
            <div class="d-flex gap-2 mb-2 p-1 border rounded bg-light" style="font-size: 0.85rem;">
              <div class="form-check">
                <input class="form-check-input" type="radio" name="matchType" id="typeGroup" value="group" checked>
                <label class="form-check-label" for="typeGroup">Grupos</label>
              </div>
              <div class="form-check">
                <input class="form-check-input" type="radio" name="matchType" id="typeElim" value="elim">
                <label class="form-check-label" for="typeElim">Eliminatoria</label>
              </div>
            </div>
          </div>

          <div id="group-container">
            <label class="small mb-1 d-block">Grupo</label>
            <select id="swal-group" class="swal-select-custom py-1" style="font-size: 0.9rem;">
              <option value="">Selecciona un grupo...</option>
              ${this.groups.map(g => `<option value="${g.id}">${g.name}</option>`).join('')}
            </select>
          </div>

          <div>
            <label class="small fw-bold mb-1 d-block">2. Equipos</label>
            <div class="form-check form-switch mb-2" style="font-size: 0.85rem;">
              <input class="form-check-input" type="checkbox" id="swal-placeholder-toggle">
              <label class="form-check-label" for="swal-placeholder-toggle">Definir luego (Placeholders)</label>
            </div>

            <div id="teams-selection-container">
              <div class="row g-2">
                <div class="col-6">
                  <label class="small mb-1 d-block">Local</label>
                  <select id="swal-home" class="swal-select-custom py-1" style="font-size: 0.9rem;"></select>
                </div>
                <div class="col-6">
                  <label class="small mb-1 d-block">Visitante</label>
                  <select id="swal-away" class="swal-select-custom py-1" style="font-size: 0.9rem;"></select>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label class="small fw-bold mb-1 d-block">3. Detalles</label>
            <div class="row g-2">
              <div class="col-12 mb-1">
                <label class="small mb-1 d-block">Campo / Sede</label>
                <select id="swal-field" class="swal-select-custom py-1" style="font-size: 0.9rem;">
                  ${this.fields.map(f => `<option value="${f.id}">${f.name} (${f.location})</option>`).join('')}
                </select>
              </div>
              <div class="col-7">
                <label class="small mb-1 d-block">Fecha y Hora</label>
                <input id="swal-date" type="datetime-local" class="swal-input-custom py-1" style="font-size: 0.9rem;">
              </div>
              <div class="col-5">
                <label class="small mb-1 d-block">Fase</label>
                <select id="swal-phase" class="swal-select-custom py-1" style="font-size: 0.9rem;">
                  <option value="fase_de_grupos">Grup.</option>
                  <option value="octavos">Octav.</option>
                  <option value="cuartos">Cuart.</option>
                  <option value="semis">Semis</option>
                  <option value="final">Final</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Crear Partido',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: 'var(--secundario)',
      didOpen: () => {
        const typeGroup = document.getElementById('typeGroup') as HTMLInputElement;
        const typeElim = document.getElementById('typeElim') as HTMLInputElement;
        const groupContainer = document.getElementById('group-container') as HTMLDivElement;
        const groupSelect = document.getElementById('swal-group') as HTMLSelectElement;
        const placeholderToggle = document.getElementById('swal-placeholder-toggle') as HTMLInputElement;
        const homeSelect = document.getElementById('swal-home') as HTMLSelectElement;
        const awaySelect = document.getElementById('swal-away') as HTMLSelectElement;
        const phaseSelect = document.getElementById('swal-phase') as HTMLSelectElement;

        const updateTeamsVisibility = () => {
          const isPlaceholder = placeholderToggle.checked;
          const teamsSelectionContainer = document.getElementById('teams-selection-container') as HTMLDivElement;
          teamsSelectionContainer.style.display = isPlaceholder ? 'none' : 'block';
        };

        const loadTeams = () => {
          const isGroup = typeGroup.checked;
          const groupId = parseInt(groupSelect.value);

          if (isGroup) {
            if (groupId) {
              this.apiService.getGroupTeams(groupId).subscribe(teams => {
                const options = teams.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
                homeSelect.innerHTML = options;
                awaySelect.innerHTML = options;
              });
            } else {
              homeSelect.innerHTML = '';
              awaySelect.innerHTML = '';
            }
          } else {
            // Cargar todos los equipos de la temporada
            this.apiService.getTeams(seasonId, 1, 100).subscribe(res => {
              const teams = res.teams || [];
              const options = teams.map((t: any) => `<option value="${t.id}">${t.name}</option>`).join('');
              homeSelect.innerHTML = options;
              awaySelect.innerHTML = options;
            });
          }
        };

        typeGroup.addEventListener('change', () => {
          groupContainer.style.display = 'block';
          phaseSelect.value = 'fase_de_grupos';
          loadTeams();
        });

        typeElim.addEventListener('change', () => {
          groupContainer.style.display = 'none';
          if (phaseSelect.value === 'fase_de_grupos') phaseSelect.value = 'octavos';
          loadTeams();
        });

        groupSelect.addEventListener('change', loadTeams);
        placeholderToggle.addEventListener('change', updateTeamsVisibility);

        // Inicializar equipos
        loadTeams();
      },
      preConfirm: () => {
        const isGroup = (document.querySelector('input[name="matchType"]:checked') as HTMLInputElement).value === 'group';
        const isPlaceholder = (document.getElementById('swal-placeholder-toggle') as HTMLInputElement).checked;

        const groupId = isGroup ? (document.getElementById('swal-group') as HTMLSelectElement).value : null;
        const fieldId = (document.getElementById('swal-field') as HTMLSelectElement).value;
        const date = (document.getElementById('swal-date') as HTMLInputElement).value;
        const phase = (document.getElementById('swal-phase') as HTMLSelectElement).value;

        let homeTeamId = null;
        let awayTeamId = null;

        if (!isPlaceholder) {
          homeTeamId = (document.getElementById('swal-home') as HTMLSelectElement).value;
          awayTeamId = (document.getElementById('swal-away') as HTMLSelectElement).value;
          if (!homeTeamId || !awayTeamId) {
            Swal.showValidationMessage('Selecciona los equipos participantes');
            return null;
          }
          if (homeTeamId === awayTeamId) {
            Swal.showValidationMessage('Un equipo no puede jugar contra sí mismo');
            return null;
          }
        }

        if (isGroup && !groupId) {
          Swal.showValidationMessage('Debes seleccionar un grupo para la fase de grupos');
          return null;
        }

        if (!fieldId || !date) {
          Swal.showValidationMessage('Rellena la fecha y el campo');
          return null;
        }

        return {
          date,
          homeTeamId: homeTeamId ? parseInt(homeTeamId) : null,
          awayTeamId: awayTeamId ? parseInt(awayTeamId) : null,
          fieldId: parseInt(fieldId),
          groupId: groupId ? parseInt(groupId) : null,
          seasonId: seasonId,
          phase
        };
      }
    });

    if (formValues) {
      this.apiService.createMatch(formValues).subscribe({
        next: () => {
          Swal.fire('¡Creado!', 'El partido se ha guardado correctamente.', 'success');
          this.loadMatches();
        },
        error: (err) => {
          Swal.fire('Error', err.error?.message || 'No se pudo crear el partido', 'error');
        }
      });
    }
  }

  deleteMatch(id: number) {
    const errorColor = getComputedStyle(document.documentElement).getPropertyValue('--error').trim() || '#ef4444';

    Swal.fire({
      title: '¿Mover a la papelera?',
      text: "El partido se ocultará del calendario público pero podrás restaurarlo desde la papelera.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: errorColor,
      confirmButtonText: 'Sí, mover',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        this.apiService.deleteMatch(id).subscribe({
          next: () => {
            Swal.fire('¡Enviado!', 'El partido se ha movido a la papelera.', 'success');
            this.loadMatches();
          },
          error: () => Swal.fire('Error', 'No se pudo mover el partido', 'error')
        });
      }
    });
  }

  async openMatchesTrashModal() {
    Swal.fire({
      title: 'Papelera de Partidos',
      html: `
        <div id="trash-loader" class="p-4 text-center">
          <i class="fas fa-spinner fa-spin fa-2x" style="color: var(--primario);"></i>
        </div>
        <div id="trash-container"></div>
      `,
      showConfirmButton: false,
      showCloseButton: true,
      width: '700px',
      didOpen: () => {
        this.apiService.getMatchesTrash().subscribe({
          next: (matches) => {
            const loader = document.getElementById('trash-loader');
            if (loader) loader.style.display = 'none';

            const container = document.getElementById('trash-container');
            if (!container) return;

            if (matches.length === 0) {
              container.innerHTML = '<div class="p-4 text-center text-muted">No hay partidos en la papelera.</div>';
              return;
            }

            container.innerHTML = `
              <div class="table-responsive">
                <table class="admin-table">
                  <thead><tr><th>Fecha</th><th>Partido</th><th>Temporada</th><th>Acción</th></tr></thead>
                  <tbody>
                    ${matches.map(m => `
                      <tr>
                        <td>${new Date(m.date).toLocaleDateString()}</td>
                        <td class="text-start">
                          <small>${m.home_team_name || m.home_team_placeholder} vs ${m.away_team_name || m.away_team_placeholder}</small>
                        </td>
                        <td>${m.season_name}</td>
                        <td>
                          <div class="d-flex justify-content-center gap-2">
                            <button class="btn-icon manage btn-restore-match" data-id="${m.id}" title="Restaurar">
                              <i class="fas fa-trash-restore"></i>
                            </button>
                            <button class="btn-icon delete btn-permanent-delete-match" data-id="${m.id}" title="Eliminar Definitivamente">
                              <i class="fas fa-times-circle"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `;

            container.querySelectorAll('.btn-restore-match').forEach(btn => {
              btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                if (id) {
                  this.apiService.restoreMatch(parseInt(id)).subscribe(() => {
                    Swal.fire('Restaurado', 'Partido recuperado correctamente', 'success');
                    this.loadMatches();
                    this.openMatchesTrashModal();
                  });
                }
              });
            });

            // Eventos para eliminar definitivamente
            container.querySelectorAll('.btn-permanent-delete-match').forEach(btn => {
              btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                if (id) {
                  Swal.fire({
                    title: '¿Eliminar para siempre?',
                    text: 'Esta acción borrará el partido y todos sus eventos de la base de datos definitivamente.',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Sí, borrar para siempre',
                    confirmButtonColor: '#d33',
                    cancelButtonText: 'Cancelar'
                  }).then((result) => {
                    if (result.isConfirmed) {
                      this.apiService.deletePermanentMatch(parseInt(id)).subscribe({
                        next: () => {
                          Swal.fire('¡Borrado!', 'El partido ha sido eliminado definitivamente.', 'success');
                          this.loadMatches();
                          this.openMatchesTrashModal();
                        },
                        error: (err) => Swal.fire('Error', err.error.message || 'No se pudo eliminar', 'error')
                      });
                    }
                  });
                }
              });
            });
          }
        });
      }
    });
  }
}
