import { Component, inject, OnInit, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../../services/api-service';
import { SeasonService } from '../../../services/season-service';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Swal from 'sweetalert2';


@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit {
  private apiService = inject(ApiService);
  private seasonService = inject(SeasonService);
  
  stats: any = {
    totalTeams: 0,
    totalPlayers: 0,
    pendingMatches: 0,
    totalUsers: 0
  };
  
  recentActivity: any[] = [];
  loading: boolean = true;
  isGeneratingPdf = signal(false);
  isGeneratingTeamsPdf = signal(false);
  isGeneratingStandingsPdf = signal(false);

  constructor() {
    effect(() => {
      const seasonId = this.seasonService.currentSeasonId();
      if (seasonId) {
        this.loadSummary();
      }
    });
  }

  ngOnInit() {
    // La carga inicial la maneja el effect del constructor
  }

  loadSummary() {
    this.loading = true;
    const seasonId = this.seasonService.currentSeasonId();
    this.apiService.getAdminSummary(seasonId || undefined).subscribe({
      next: (data) => {
        this.stats = data.stats;
        this.recentActivity = data.recentActivity;
        this.loading = false;
      },
      error: (err) => {
        console.error('Error al cargar el resumen administrativo', err);
        this.loading = false;
      }
    });
  }

  // Traduce acciones antiguas (en inglés) a español para el dashboard
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

  downloadDossier() {
    this.isGeneratingPdf.set(true);
    const seasonId = this.seasonService.currentSeasonId();
    
    this.apiService.getSeasonReport(seasonId || undefined).subscribe({
      next: (matches) => {
        if (!matches || matches.length === 0) {
          Swal.fire({ icon: 'info', title: 'Atención', text: 'No hay partidos finalizados para reportar.', background: '#1C1F26', color: '#EDEDED' });
          this.isGeneratingPdf.set(false);
          return;
        }

        const doc = new jsPDF();
        
        doc.setFontSize(22);
        doc.setTextColor(0, 174, 239);
        doc.text('Dossier de Partidos Finalizados', 14, 20);
        
        doc.setFontSize(10);
        doc.setTextColor(150, 150, 150);
        doc.text(`Temporada generada el: ${new Date().toLocaleDateString()}`, 14, 28);
        
        let startY = 40;

        matches.forEach((match: any, index: number) => {
          if (index > 0) {
            doc.addPage();
          }

          let startY = 25;
          const pageWidth = doc.internal.pageSize.width || doc.internal.pageSize.getWidth();

          // Título de cabecera general en cada página
          doc.setFontSize(10);
          doc.setTextColor(150, 150, 150);
          doc.text('Dossier de Temporada', 14, 15);
          doc.line(14, 18, pageWidth - 14, 18);

          // Cabecera del partido (Centrado)
          doc.setFontSize(18);
          doc.setTextColor(20, 20, 20);
          const score = `${match.home_goals} - ${match.away_goals}`;
          const penaltis = match.home_penalty_goals !== null ? ` (P: ${match.home_penalty_goals}-${match.away_penalty_goals})` : '';
          const matchTitle = `${match.home_team_name || match.home_team_placeholder || 'Local'} ${score} ${match.away_team_name || match.away_team_placeholder || 'Visitante'}${penaltis}`;
          
          const textWidth = doc.getTextWidth(matchTitle);
          doc.text(matchTitle, (pageWidth - textWidth) / 2, startY + 10);
          
          doc.setFontSize(11);
          doc.setTextColor(100, 100, 100);
          const dateStr = new Date(match.date).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute:'2-digit' });
          const dateWidth = doc.getTextWidth(dateStr);
          doc.text(dateStr, (pageWidth - dateWidth) / 2, startY + 18);
          
          startY += 35;

          // Eventos divididos
          const homeEvents = match.events ? match.events.filter((e: any) => e.team === 'home') : [];
          const awayEvents = match.events ? match.events.filter((e: any) => e.team === 'away') : [];

          const formatAction = (type: string) => {
            if (type === 'gol') return 'Gol';
            if (type === 'tarjeta_amarilla') return 'T. Amarilla';
            if (type === 'tarjeta_roja') return 'T. Roja';
            if (type === 'penalty_shootout_goal') return 'Penalti Marcado';
            if (type === 'penalty_shootout_miss') return 'Penalti Fallado';
            return type;
          };

          const homeBody = homeEvents.map((e: any) => [formatAction(e.type), e.player_name || 'Desc.']);
          const awayBody = awayEvents.map((e: any) => [formatAction(e.type), e.player_name || 'Desc.']);

          let finalY = startY;

          if (homeBody.length > 0 || awayBody.length > 0) {
            
            // Tabla Local (Mitad Izquierda)
            if (homeBody.length > 0) {
              autoTable(doc, {
                startY: startY,
                head: [[match.home_team_name || 'Local', 'Jugador']],
                body: homeBody,
                theme: 'grid',
                headStyles: { fillColor: [0, 174, 239] },
                margin: { left: 14, right: pageWidth / 2 + 5 },
              });
              finalY = Math.max(finalY, (doc as any).lastAutoTable.finalY);
            } else {
               doc.setFontSize(10);
               doc.setTextColor(150, 150, 150);
               doc.text("Sin eventos registrados", 14, startY + 10);
               finalY = Math.max(finalY, startY + 10);
            }

            // Tabla Visitante (Mitad Derecha)
            if (awayBody.length > 0) {
              autoTable(doc, {
                startY: startY,
                head: [[match.away_team_name || 'Visitante', 'Jugador']],
                body: awayBody,
                theme: 'grid',
                headStyles: { fillColor: [247, 148, 29] }, // Color secundario (Naranja)
                margin: { left: pageWidth / 2 + 5, right: 14 },
              });
              finalY = Math.max(finalY, (doc as any).lastAutoTable.finalY);
            } else {
               doc.setFontSize(10);
               doc.setTextColor(150, 150, 150);
               doc.text("Sin eventos registrados", pageWidth / 2 + 5, startY + 10);
               finalY = Math.max(finalY, startY + 10);
            }
          } else {
            doc.setFontSize(12);
            doc.setTextColor(150, 150, 150);
            const msg = 'No hay eventos registrados para este partido.';
            const msgW = doc.getTextWidth(msg);
            doc.text(msg, (pageWidth - msgW) / 2, startY + 10);
            finalY = startY + 20;
          }
          
          finalY += 20;

          // Observaciones
          if (match.observations) {
            doc.setFontSize(12);
            doc.setTextColor(50, 50, 50);
            doc.setFont("helvetica", "bold");
            doc.text("Observaciones del Acta:", 14, finalY);
            doc.setFont("helvetica", "normal");
            finalY += 8;
            
            doc.setFontSize(11);
            const obsLines = doc.splitTextToSize(match.observations, pageWidth - 28);
            doc.text(obsLines, 14, finalY);
          }
        });

        doc.save('Dossier_Temporada.pdf');
        this.isGeneratingPdf.set(false);
      },
      error: (err) => {
        console.error(err);
        Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo generar el dossier.', background: '#1C1F26', color: '#EDEDED' });
        this.isGeneratingPdf.set(false);
      }
    });
  }

  downloadTeamsDossier() {
    this.isGeneratingTeamsPdf.set(true);
    const seasonId = this.seasonService.currentSeasonId();
    
    this.apiService.getSeasonTeamsReport(seasonId || undefined).subscribe({
      next: (teams) => {
        if (!teams || teams.length === 0) {
          Swal.fire({ icon: 'info', title: 'Atención', text: 'No hay equipos registrados en esta temporada.', background: '#1C1F26', color: '#EDEDED' });
          this.isGeneratingTeamsPdf.set(false);
          return;
        }

        const doc = new jsPDF();
        
        teams.forEach((team: any, index: number) => {
          if (index > 0) {
            doc.addPage();
          }

          let startY = 25;
          const pageWidth = doc.internal.pageSize.width || doc.internal.pageSize.getWidth();

          // Título de cabecera general en cada página
          doc.setFontSize(10);
          doc.setTextColor(150, 150, 150);
          doc.text('Dossier de Equipos', 14, 15);
          doc.line(14, 18, pageWidth - 14, 18);

          // Cabecera del equipo (Centrado)
          doc.setFontSize(22);
          doc.setTextColor(20, 20, 20);
          const teamName = team.name || 'Equipo Desconocido';
          const textWidth = doc.getTextWidth(teamName);
          doc.text(teamName, (pageWidth - textWidth) / 2, startY + 10);
          
          startY += 30;

          // Info del equipo
          doc.setFontSize(12);
          doc.setTextColor(50, 50, 50);
          doc.setFont("helvetica", "bold");
          doc.text("Cuerpo Técnico y Contacto:", 14, startY);
          doc.setFont("helvetica", "normal");
          startY += 8;
          
          doc.setFontSize(11);
          doc.text(`Entrenador: ${team.coach || 'No especificado'}`, 14, startY);
          startY += 6;
          doc.text(`Delegado: ${team.delegate || 'No especificado'}`, 14, startY);
          startY += 6;
          doc.text(`Teléfono: ${team.phone || 'No especificado'}`, 14, startY);
          
          startY += 15;

          // Tabla de jugadores
          if (team.players && team.players.length > 0) {
            const tableBody = team.players.map((p: any) => {
              let birthDateStr = 'No especificada';
              if (p.birth_date) {
                birthDateStr = new Date(p.birth_date).toLocaleDateString('es-ES');
              }
              return [
                p.jersey_number || '-',
                p.name || 'Desconocido',
                birthDateStr
              ];
            });

            autoTable(doc, {
              startY: startY,
              head: [['Dorsal', 'Jugador', 'Fecha de Nacimiento']],
              body: tableBody,
              theme: 'grid',
              headStyles: { fillColor: [0, 174, 239] },
              margin: { left: 14, right: 14 },
            });
          } else {
            doc.setFontSize(12);
            doc.setTextColor(150, 150, 150);
            doc.text('Este equipo no tiene jugadores inscritos.', 14, startY + 10);
          }
        });

        doc.save('Dossier_Equipos.pdf');
        this.isGeneratingTeamsPdf.set(false);
      },
      error: (err) => {
        console.error(err);
        Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo generar el dossier de equipos.', background: '#1C1F26', color: '#EDEDED' });
        this.isGeneratingTeamsPdf.set(false);
      }
    });
  }

  downloadStandingsDossier() {
    this.isGeneratingStandingsPdf.set(true);
    const seasonId = this.seasonService.currentSeasonId();
    
    this.apiService.getStandings(seasonId || undefined).subscribe({
      next: (data) => {
        const groupsData = data.groups;
        if (!groupsData || Object.keys(groupsData).length === 0) {
          Swal.fire({ icon: 'info', title: 'Atención', text: 'No hay datos de clasificación para exportar.', background: '#1C1F26', color: '#EDEDED' });
          this.isGeneratingStandingsPdf.set(false);
          return;
        }

        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.width || doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.height || doc.internal.pageSize.getHeight();
        
        let startY = 25;
        let isFirstGroup = true;

        const printHeader = (y: number) => {
          doc.setFontSize(10);
          doc.setTextColor(150, 150, 150);
          doc.text('Clasificación Oficial - Torneo', 14, 15);
          const dateStr = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
          const dateWidth = doc.getTextWidth(dateStr);
          doc.text(dateStr, pageWidth - 14 - dateWidth, 15);
          doc.line(14, 18, pageWidth - 14, 18);
          return y;
        };

        printHeader(startY);

        for (const [groupName, teams] of Object.entries(groupsData)) {
          // Si no es el primer grupo, comprobamos si cabe en la página
          if (!isFirstGroup) {
            startY = (doc as any).lastAutoTable.finalY + 20;
            // Si nos acercamos al final de la página (margen de 40px para el título), saltamos de página
            if (startY + 40 > pageHeight) {
              doc.addPage();
              startY = 25;
              printHeader(startY);
            }
          }
          isFirstGroup = false;

          // Título del Grupo
          doc.setFontSize(18);
          doc.setTextColor(20, 20, 20);
          const titleWidth = doc.getTextWidth(`Clasificación del Grupo: ${groupName}`);
          doc.text(`Clasificación del Grupo ${groupName}`, (pageWidth - titleWidth) / 2, startY);
          
          startY += 10;

          const tableBody = (teams as any[]).map((t, i) => [
            (i + 1).toString(),
            t.team_name,
            t.points,
            t.played,
            t.won,
            t.drawn,
            t.lost,
            t.goals_for,
            t.goals_against,
            (t.goals_for - t.goals_against).toString()
          ]);

          autoTable(doc, {
            startY: startY,
            head: [['Pos', 'Equipo', 'Pts', 'PJ', 'G', 'E', 'P', 'GF', 'GC', 'DIF']],
            body: tableBody,
            theme: 'grid',
            headStyles: { fillColor: [0, 174, 239], halign: 'center' },
            columnStyles: {
              0: { halign: 'center', fontStyle: 'bold' },
              1: { fontStyle: 'bold' },
              2: { halign: 'center', fontStyle: 'bold', textColor: [0, 174, 239] },
              3: { halign: 'center' },
              4: { halign: 'center' },
              5: { halign: 'center' },
              6: { halign: 'center' },
              7: { halign: 'center' },
              8: { halign: 'center' },
              9: { halign: 'center', fontStyle: 'bold' }
            },
            margin: { left: 14, right: 14 },
          });
        }

        const bestFourths = data.fourthPlacesRanking;
        if (bestFourths && bestFourths.length > 0) {
          startY = (doc as any).lastAutoTable.finalY + 20;
          if (startY + 40 > pageHeight) {
            doc.addPage();
            startY = 25;
            printHeader(startY);
          }

          doc.setFontSize(18);
          doc.setTextColor(20, 20, 20);
          const title = 'Ranking de Mejores 4ºs';
          const titleWidth = doc.getTextWidth(title);
          doc.text(title, (pageWidth - titleWidth) / 2, startY);
          
          startY += 10;

          const tableBody = bestFourths.map((t: any, i: number) => [
            (i + 1).toString(),
            t.team_name,
            t.points,
            t.played,
            t.won,
            t.drawn,
            t.lost,
            t.goals_for,
            t.goals_against,
            (t.goals_for - t.goals_against).toString()
          ]);

          autoTable(doc, {
            startY: startY,
            head: [['Pos', 'Equipo', 'Pts', 'PJ', 'G', 'E', 'P', 'GF', 'GC', 'DIF']],
            body: tableBody,
            theme: 'grid',
            headStyles: { fillColor: [247, 148, 29], halign: 'center' },
            columnStyles: {
              0: { halign: 'center', fontStyle: 'bold' },
              1: { fontStyle: 'bold' },
              2: { halign: 'center', fontStyle: 'bold', textColor: [247, 148, 29] },
              3: { halign: 'center' },
              4: { halign: 'center' },
              5: { halign: 'center' },
              6: { halign: 'center' },
              7: { halign: 'center' },
              8: { halign: 'center' },
              9: { halign: 'center', fontStyle: 'bold' }
            },
            margin: { left: 14, right: 14 },
          });
        }

        doc.save('Dossier_Clasificacion.pdf');
        this.isGeneratingStandingsPdf.set(false);
      },
      error: (err) => {
        console.error(err);
        Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo generar el dossier de clasificación.', background: '#1C1F26', color: '#EDEDED' });
        this.isGeneratingStandingsPdf.set(false);
      }
    });
  }
}
