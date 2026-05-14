import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Match } from '../models/match.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ApiService {

  private http = inject(HttpClient);
  private readonly urlApi = environment.apiUrl;

  // ==========================================
  // --- AUTENTICACIÓN Y PERFIL ---
  // ==========================================

  /** Registra un nuevo usuario en el sistema */
  register(data: any): Observable<any> {
    return this.http.post(`${this.urlApi}/register`, data);
  }

  /** Inicia sesión y obtiene el token de acceso */
  login(data: any): Observable<any> {
    return this.http.post(`${this.urlApi}/login`, data);
  }

  /** Obtiene la información del perfil del usuario autenticado */
  getUserProfile(): Observable<any> {
    return this.http.get(`${this.urlApi}/user/profile`);
  }

  /** Solicita la recuperación de contraseña enviando un correo */
  forgotPassword(email: string): Observable<any> {
    return this.http.post(`${this.urlApi}/forgot-password`, { email });
  }

  /** Restablece la contraseña usando el token enviado por correo */
  resetPassword(token: string, newPassword: string): Observable<any> {
    return this.http.post(`${this.urlApi}/reset-password`, { token, newPassword });
  }

  /** Verifica el correo electrónico del usuario */
  verifyEmail(token: string): Observable<any> {
    return this.http.get(`${this.urlApi}/verify-email/${token}`);
  }

  /** Reenvía el correo de verificación */
  resendVerification(email: string): Observable<any> {
    return this.http.post(`${this.urlApi}/resend-verification`, { email });
  }

  // ==========================================
  // --- TEMPORADAS (SEASONS) ---
  // ==========================================

  /** Obtiene el listado de todas las temporadas */
  getSeasons(): Observable<any[]> {
    return this.http.get<any[]>(`${this.urlApi}/seasons`);
  }

  /** Obtiene la temporada que está marcada como activa actualmente */
  getActiveSeason(): Observable<any> {
    return this.http.get(`${this.urlApi}/admin/active-season`);
  }

  /** Crea una nueva temporada */
  createSeason(data: any): Observable<any> {
    return this.http.post(`${this.urlApi}/seasons`, data);
  }

  /** Actualiza los datos de una temporada existente */
  updateSeason(id: number, data: any): Observable<any> {
    return this.http.put(`${this.urlApi}/seasons/${id}`, data);
  }

  /** Elimina una temporada (y sus dependencias si no tienen restricciones) */
  deleteSeason(id: number): Observable<any> {
    return this.http.delete(`${this.urlApi}/seasons/${id}`);
  }

  /** Importa la estructura de grupos y jugadores de una temporada a otra */
  importSeasonStructure(targetSeasonId: number, fromSeasonId: number): Observable<any> {
    return this.http.post(`${this.urlApi}/seasons/${targetSeasonId}/import-structure`, { fromSeasonId });
  }


  // ==========================================
  // --- EQUIPOS (TEAMS) ---
  // ==========================================

  /** Obtiene el listado paginado de equipos, con búsqueda y filtro opcional por temporada o exclusión de temporada */
  getTeams(seasonId?: number, page: number = 1, limit: number = 10, search: string = '', excludeSeasonId?: number): Observable<any> {
    let url = `${this.urlApi}/teams?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`;
    if (seasonId) url += `&season_id=${seasonId}`;
    if (excludeSeasonId) url += `&exclude_season_id=${excludeSeasonId}`;
    return this.http.get<any>(url);
  }

  /** Obtiene la información detallada de un equipo por su ID, opcionalmente filtrada por temporada */
  getTeamById(id: string, seasonId?: number): Observable<any> {
    const url = seasonId ? `${this.urlApi}/teams/${id}?season_id=${seasonId}` : `${this.urlApi}/teams/${id}`;
    return this.http.get<any>(url);
  }

  /** Registra un equipo existente en una temporada específica */
  registerTeam(teamId: number, seasonId: number): Observable<any> {
    return this.http.post<any>(`${this.urlApi}/teams/${teamId}/register`, { season_id: seasonId });
  }

  /** Crea un nuevo equipo de forma global */
  createTeam(data: any): Observable<any> {
    return this.http.post(`${this.urlApi}/teams`, data);
  }

  /** Actualiza los datos de un equipo existente */
  updateTeam(id: number, data: any): Observable<any> {
    return this.http.put(`${this.urlApi}/teams/${id}`, data);
  }

  /** Elimina un equipo del sistema (Borrado lógico) */
  deleteTeam(id: number): Observable<any> {
    return this.http.delete(`${this.urlApi}/teams/${id}`);
  }

  /** Elimina un equipo de una temporada específica */
  removeTeamFromSeason(teamId: number, seasonId: number): Observable<any> {
    return this.http.delete(`${this.urlApi}/teams/${teamId}/season/${seasonId}`);
  }

  /** Elimina definitivamente un equipo de la base de datos */
  deletePermanentTeam(id: number): Observable<any> {
    return this.http.delete(`${this.urlApi}/teams/${id}/permanent`);
  }

  /** Obtiene el listado de equipos eliminados (Papelera) */
  getTeamsTrash(): Observable<any[]> {
    return this.http.get<any[]>(`${this.urlApi}/teams/admin/trash`);
  }

  /** Restaura un equipo que estaba en la papelera */
  restoreTeam(id: number): Observable<any> {
    return this.http.post(`${this.urlApi}/teams/${id}/restore`, {});
  }

  /** Permite a un usuario seguir o dejar de seguir a un equipo */
  toggleFollowTeam(teamId: number): Observable<any> {
    return this.http.post(`${this.urlApi}/teams/${teamId}/toggle-follow`, {});
  }

  /** Obtiene los equipos que pertenecen a un grupo específico */
  getGroupTeams(groupId: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.urlApi}/groups/${groupId}/teams`);
  }

  /** Asigna un equipo a un grupo para una temporada concreta */
  addGroupTeam(groupId: number, teamId: number, seasonId: number): Observable<any> {
    return this.http.post(`${this.urlApi}/groups/${groupId}/teams`, { team_id: teamId, season_id: seasonId });
  }

  /** Elimina la asignación de un equipo a un grupo */
  removeGroupTeam(groupId: number, teamId: number, seasonId: number): Observable<any> {
    return this.http.delete(`${this.urlApi}/groups/${groupId}/teams/${teamId}?season_id=${seasonId}`);
  }


  // ==========================================
  // --- JUGADORES (PLAYERS) ---
  // ==========================================

  /** Obtiene el listado paginado de jugadores, con búsqueda y filtro opcional por temporada o exclusión de temporada */
  getPlayers(seasonId?: number, page: number = 1, limit: number = 10, search: string = '', excludeSeasonId?: number): Observable<any> {
    let url = `${this.urlApi}/players?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`;
    if (seasonId) url += `&season_id=${seasonId}`;
    if (excludeSeasonId) url += `&exclude_season_id=${excludeSeasonId}`;
    return this.http.get<any>(url);
  }

  /** Obtiene la ficha detallada de un jugador por su ID, opcionalmente filtrada por temporada */
  getPlayerById(id: string, seasonId?: number): Observable<any> {
    const url = seasonId ? `${this.urlApi}/players/${id}?season_id=${seasonId}` : `${this.urlApi}/players/${id}`;
    return this.http.get<any>(url);
  }

  /** Crea un nuevo jugador en la base de datos global */
  createPlayer(data: any): Observable<any> {
    return this.http.post(`${this.urlApi}/players`, data);
  }

  /** Actualiza la información personal de un jugador */
  updatePlayer(id: number, data: any): Observable<any> {
    return this.http.put(`${this.urlApi}/players/${id}`, data);
  }

  /** Obtiene los jugadores inscritos en un equipo para una temporada concreta */
  getTeamPlayers(teamId: number, seasonId: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.urlApi}/teams/${teamId}/players?season_id=${seasonId}`);
  }

  /** Inscribe a un jugador en un equipo para una temporada, opcionalmente con un dorsal */
  registerPlayer(data: { player_id: number, team_id: number | null, season_id: number, jersey_number?: string | number | null }): Observable<any> {
    return this.http.post(`${this.urlApi}/players/${data.player_id}/register`, data);
  }

  /** Elimina la inscripción de un jugador en un equipo específico para una temporada */
  unregisterPlayerFromTeam(playerId: number, data: { team_id: number, season_id: number }): Observable<any> {
    return this.http.request('delete', `${this.urlApi}/players/${playerId}/unregister`, { body: data });
  }

  /** Da de baja definitiva a un jugador de una temporada (lo quita del equipo y borra sus estadísticas del año) */
  removePlayerFromSeason(playerId: number, seasonId: number): Observable<any> {
    return this.http.delete(`${this.urlApi}/players/${playerId}/season/${seasonId}`);
  }

  /** Elimina un jugador del sistema global (Borrado lógico) */
  deleteGlobalPlayer(id: number): Observable<any> {
    return this.http.delete(`${this.urlApi}/players/${id}`);
  }

  /** Elimina definitivamente un jugador de la base de datos */
  deletePermanentPlayer(id: number): Observable<any> {
    return this.http.delete(`${this.urlApi}/players/${id}/permanent`);
  }

  /** Obtiene el listado de jugadores eliminados (Papelera) */
  getPlayersTrash(): Observable<any[]> {
    return this.http.get<any[]>(`${this.urlApi}/players/admin/trash`);
  }

  /** Restaura un jugador que estaba en la papelera */
  restorePlayer(id: number): Observable<any> {
    return this.http.post(`${this.urlApi}/players/${id}/restore`, {});
  }


  // ==========================================
  // --- PARTIDOS (MATCHES) ---
  // ==========================================

  /** Obtiene el calendario de partidos, filtrado por temporada */
  getMatches(seasonId?: number): Observable<Match[]> {
    const url = seasonId ? `${this.urlApi}/matches?season_id=${seasonId}` : `${this.urlApi}/matches`;
    return this.http.get<Match[]>(url);
  }

  /** Obtiene el reporte masivo de partidos finalizados y sus eventos */
  getSeasonReport(seasonId?: number): Observable<any[]> {
    const url = seasonId ? `${this.urlApi}/matches/admin/report?season_id=${seasonId}` : `${this.urlApi}/matches/admin/report`;
    return this.http.get<any[]>(url);
  }

  /** Obtiene el reporte masivo de equipos y sus plantillas */
  getSeasonTeamsReport(seasonId?: number): Observable<any[]> {
    const url = seasonId ? `${this.urlApi}/teams/admin/report?season_id=${seasonId}` : `${this.urlApi}/teams/admin/report`;
    return this.http.get<any[]>(url);
  }

  /** Obtiene el detalle completo y eventos de un partido por su ID */
  getMatchById(id: string): Observable<Match> {
    return this.http.get<Match>(`${this.urlApi}/matches/${id}`);
  }

  /** Crea un nuevo partido (Admin) */
  createMatch(matchData: any): Observable<any> {
    return this.http.post(`${this.urlApi}/matches`, matchData);
  }

  /** Elimina un partido y sus datos asociados (Admin) */
  deleteMatch(id: number): Observable<any> {
    return this.http.delete(`${this.urlApi}/matches/${id}`);
  }

  /** Elimina definitivamente un partido de la base de datos */
  deletePermanentMatch(id: number): Observable<any> {
    return this.http.delete(`${this.urlApi}/matches/${id}/permanent`);
  }

  /** Obtiene partidos eliminados (Papelera) */
  getMatchesTrash(): Observable<any[]> {
    return this.http.get<any[]>(`${this.urlApi}/matches/admin/trash`);
  }

  /** Restaura un partido de la papelera */
  restoreMatch(id: number): Observable<any> {
    return this.http.post(`${this.urlApi}/matches/${id}/restore`, {});
  }

  /** Registra el voto de un usuario en la porra de un partido */
  vote(matchId: number, vote: 'local' | 'empate' | 'visitante'): Observable<any> {
    return this.http.post(`${this.urlApi}/matches/${matchId}/vote`, { vote });
  }

  /** Bloquea un partido para edición exclusiva (Árbitros/Admin) */
  lockMatch(id: string): Observable<any> {
    return this.http.post(`${this.urlApi}/matches/${id}/lock`, {});
  }

  /** Libera el bloqueo de un partido */
  unlockMatch(id: string, force: boolean = false): Observable<any> {
    const url = force ? `${this.urlApi}/matches/${id}/unlock?force=true` : `${this.urlApi}/matches/${id}/unlock`;
    return this.http.post(url, {});
  }

  /** Cambia el estado del partido (pendiente, en curso, finalizado) */
  updateMatchStatus(id: string, status: string): Observable<any> {
    return this.http.put(`${this.urlApi}/matches/${id}/status`, { status });
  }

  /** Registra un evento (gol, tarjeta, etc.) durante un partido */
  addMatchEvent(id: string, type: string, playerId: number, teamSide: 'home' | 'away'): Observable<any> {
    return this.http.post(`${this.urlApi}/matches/${id}/events`, { type, playerId, teamSide });
  }

  /** Elimina un evento registrado de un partido */
  deleteMatchEvent(matchId: string, eventId: number): Observable<any> {
    return this.http.delete(`${this.urlApi}/matches/${matchId}/events/${eventId}`);
  }

  /** Cierra el partido, calcula estadísticas y reparte puntos de la porra */
  finishMatch(id: string, observations: string): Observable<any> {
    return this.http.put(`${this.urlApi}/matches/${id}/finish`, { observations });
  }

  /** Actualiza los equipos o placeholders asignados a un partido */
  updateMatchTeams(id: string, data: { homeTeamId?: number | null, awayTeamId?: number | null, homePlaceholder?: string | null, awayPlaceholder?: string | null }): Observable<any> {
    return this.http.put(`${this.urlApi}/matches/${id}/teams`, data);
  }

  /** Actualiza las observaciones o acta del partido */
  updateMatchObservations(id: string, observations: string): Observable<any> {
    return this.http.put(`${this.urlApi}/matches/${id}/observations`, { observations });
  }

  /** Obtiene la marca de tiempo de la última actividad global de partidos para sincronización */
  getLastActivity(): Observable<{ timestamp: number | null }> {
    return this.http.get<{ timestamp: number | null }>(`${this.urlApi}/matches/last-activity`);
  }


  // ==========================================
  // --- COMPETICIÓN (GRUPOS, CLASIFICACIÓN, ESTADÍSTICAS) ---
  // ==========================================

  /** Obtiene la tabla de clasificación de todos los grupos de una temporada */
  getStandings(seasonId?: number): Observable<any> {
    const url = seasonId ? `${this.urlApi}/standings?season_id=${seasonId}` : `${this.urlApi}/standings`;
    return this.http.get<any>(url);
  }

  /** Obtiene los rankings individuales (goleadores, tarjetas) de una temporada */
  getStatistics(seasonId?: number): Observable<any> {
    const url = seasonId ? `${this.urlApi}/statistics?season_id=${seasonId}` : `${this.urlApi}/statistics`;
    return this.http.get<any>(url);
  }

  /** Obtiene el listado de grupos de una temporada */
  getGroups(seasonId?: number): Observable<any[]> {
    const url = seasonId ? `${this.urlApi}/groups?season_id=${seasonId}` : `${this.urlApi}/groups`;
    return this.http.get<any[]>(url);
  }

  /** Crea un nuevo grupo de competición */
  createGroup(data: any): Observable<any> {
    return this.http.post(`${this.urlApi}/groups`, data);
  }

  /** Actualiza el nombre o temporada de un grupo */
  updateGroup(id: number, data: any): Observable<any> {
    return this.http.put(`${this.urlApi}/groups/${id}`, data);
  }

  /** Elimina un grupo de competición */
  deleteGroup(id: number): Observable<any> {
    return this.http.delete(`${this.urlApi}/groups/${id}`);
  }

  /** Obtiene el ranking global de usuarios basado en los puntos de la porra */
  getUserRanking(seasonId?: number): Observable<any[]> {
    const url = seasonId ? `${this.urlApi}/statistics/user-ranking?season_id=${seasonId}` : `${this.urlApi}/statistics/user-ranking`;
    return this.http.get<any[]>(url);
  }

  /** Obtiene las estadísticas de aciertos del usuario actual en la porra */
  getMyPredictorStats(seasonId?: number): Observable<any> {
    const url = seasonId ? `${this.urlApi}/statistics/user-stats?season_id=${seasonId}` : `${this.urlApi}/statistics/user-stats`;
    return this.http.get<any>(url);
  }


  // ==========================================
  // --- ADMINISTRACIÓN Y UTILIDADES ---
  // ==========================================

  /** Obtiene el resumen estadístico para el dashboard de administración */
  getAdminSummary(seasonId?: number): Observable<any> {
    const url = seasonId ? `${this.urlApi}/admin/summary?season_id=${seasonId}` : `${this.urlApi}/admin/summary`;
    return this.http.get(url);
  }

  /** Sube una imagen a la nube (Cloudinary) y devuelve la URL */
  uploadImage(file: File, folder: string = 'general', filename: string = ''): Observable<{ url: string }> {
    const formData = new FormData();
    formData.append('image', file);
    let url = `${this.urlApi}/admin/upload?folder=${folder}`;
    if (filename) {
      url += `&filename=${encodeURIComponent(filename)}`;
    }
    return this.http.post<{ url: string }>(url, formData);
  }

  /** Obtiene el listado paginado de usuarios (Admin) */
  getAdminUsers(page: number = 1, limit: number = 10, search: string = '', seasonId?: number): Observable<any> {
    let url = `${this.urlApi}/admin/users?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`;
    if (seasonId) url += `&season_id=${seasonId}`;
    return this.http.get<any>(url);
  }

  /** Actualiza el rol o los puntos de un usuario (Admin) */
  updateAdminUser(id: number, data: any): Observable<any> {
    return this.http.put(`${this.urlApi}/admin/users/${id}`, data);
  }

  /** Elimina un usuario del sistema (Admin) */
  deleteAdminUser(id: number): Observable<any> {
    return this.http.delete(`${this.urlApi}/admin/users/${id}`);
  }

  /** Obtiene el listado de campos o sedes de juego */
  getFields(): Observable<any[]> {
    return this.http.get<any[]>(`${this.urlApi}/fields`);
  }

  /** Registra un nuevo campo o sede */
  createField(data: any): Observable<any> {
    return this.http.post(`${this.urlApi}/fields`, data);
  }

  /** Actualiza la información de un campo */
  updateField(id: number, data: any): Observable<any> {
    return this.http.put(`${this.urlApi}/fields/${id}`, data);
  }

  /** Elimina un campo del sistema */
  deleteField(id: number): Observable<any> {
    return this.http.delete(`${this.urlApi}/fields/${id}`);
  }

  /** Elimina definitivamente un campo de la base de datos */
  deletePermanentField(id: number): Observable<any> {
    return this.http.delete(`${this.urlApi}/fields/${id}/permanent`);
  }

  /** Obtiene campos eliminados (Papelera) */
  getFieldsTrash(): Observable<any[]> {
    return this.http.get<any[]>(`${this.urlApi}/fields/admin/trash`);
  }

  /** Restaura un campo de la papelera */
  restoreField(id: number): Observable<any> {
    return this.http.post(`${this.urlApi}/fields/${id}/restore`, {});
  }

  /** Obtiene el historial completo de logs de auditoría (Admin) */
  getAdminLogs(page: number = 1, limit: number = 20, seasonId?: number, username?: string, date?: string): Observable<any> {
    let url = `${this.urlApi}/admin/logs?page=${page}&limit=${limit}`;
    if (seasonId) url += `&season_id=${seasonId}`;
    if (username) url += `&username=${encodeURIComponent(username)}`;
    if (date) url += `&date=${date}`;
    return this.http.get<any>(url);
  }

  /** Desactiva y anonimiza una cuenta de usuario */
  deactivateUserAccount(id: number): Observable<any> {
    return this.http.delete(`${this.urlApi}/user/${id}`);
  }
}
