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
      // Reaccionar a cualquier cambio de temporada (incluido volver a global)
      this.seasonService.currentSeasonId();
      this.loadSummary();
    });
  }

  ngOnInit() {
    // La carga inicial la maneja el effect del constructor
  }

  loadSummary() {
    this.loading = true;
    const seasonId = this.seasonService.currentSeasonId();
    this.apiService.getAdminSummary(seasonId || undefined).subscribe({
      next: (data: any) => {
        this.stats = data.stats;
        this.recentActivity = data.recentActivity;
        this.loading = false;
      },
      error: (err: any) => {
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
      next: (matches: any[]) => {
        if (!matches || matches.length === 0) {
          Swal.fire({ icon: 'info', title: 'Atención', text: 'No hay partidos finalizados para reportar.', background: '#1C1F26', color: '#EDEDED' });
          this.isGeneratingPdf.set(false);
          return;
        }

        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.width || doc.internal.pageSize.getWidth();
        
        matches.forEach((match: any, index: number) => {
          if (index > 0) {
            doc.addPage();
          }

          const season = this.seasonService.getSelectedSeason();
          const seasonName = season?.name || 'Torneo de Fútbol Sala';
          const startDate = season?.start_date ? new Date(season.start_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' }) : '...';
          const endDate = season?.end_date ? new Date(season.end_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '...';
          const seasonDates = `Del ${startDate} al ${endDate}`;

          // CABECERA (Imagen 1)
          doc.setFont("helvetica", "bold");
          doc.setFontSize(16);
          doc.text("ACTAS DE FUTBOL SALA", pageWidth / 2, 15, { align: 'center' });
          doc.setFontSize(14);
          doc.text(seasonName.toUpperCase(), pageWidth / 2, 22, { align: 'center' });
          
          let currentY = 32;
          doc.setFontSize(10);
          
          // Fila de Info: GRUPO/FASE, PISTA, FECHA, HORA
          const groupOrPhaseLabel = match.group_name ? "GRUPO:" : "FASE:";
          const groupOrPhaseValue = match.group_name || (match.phase !== 'regular' ? match.phase : '...');

          doc.text(groupOrPhaseLabel, 14, currentY);
          doc.setFont("helvetica", "normal");
          doc.text(groupOrPhaseValue.toUpperCase(), 30, currentY);
          doc.line(30, currentY + 1, 45, currentY + 1);

          doc.setFont("helvetica", "bold");
          doc.text("PISTA:", 55, currentY);
          doc.setFont("helvetica", "normal");
          
          let pistaName = match.field_name || '...';
          if (pistaName.length > 15 && pistaName.includes(' ')) {
            // Sacar iniciales si es muy largo (Ej: Ciudad Deportiva -> C.D.)
            pistaName = pistaName.split(' ').map((w: string) => w[0]).join('.') + '.';
          }
          
          doc.text(pistaName, 72, currentY);
          doc.line(72, currentY + 1, 105, currentY + 1);

          doc.setFont("helvetica", "bold");
          doc.text("FECHA:", 110, currentY);
          doc.setFont("helvetica", "normal");
          doc.text(new Date(match.date).toLocaleDateString('es-ES'), 125, currentY);
          doc.line(125, currentY + 1, 155, currentY + 1);

          doc.setFont("helvetica", "bold");
          doc.text("HORA:", 165, currentY);
          doc.setFont("helvetica", "normal");
          doc.text(new Date(match.date).toLocaleTimeString('es-ES', {hour: '2-digit', minute:'2-digit'}), 180, currentY);
          doc.line(180, currentY + 1, pageWidth - 14, currentY + 1);

          currentY += 10;

          // Nombres de los equipos con fondo resaltado (como el rotulador rosa de la imagen)
          const colWidth = (pageWidth - 28) / 2;
          
          // Fondo para nombres de equipo
          doc.setFillColor(255, 200, 220); // Rosa clarito simulando rotulador
          doc.rect(14, currentY - 5, colWidth - 5, 7, 'F');
          doc.rect(14 + colWidth + 5, currentY - 5, colWidth - 5, 7, 'F');
          
          doc.setFont("helvetica", "bold");
          doc.setTextColor(0, 0, 0);
          doc.text(match.home_team_name?.toUpperCase() || 'LOCAL', 14, currentY);
          doc.text(match.away_team_name?.toUpperCase() || 'VISITANTE', 14 + colWidth + 5, currentY);
          
          currentY += 5;

          // Función para preparar datos de tabla por equipo
          const getTableData = (teamType: 'home' | 'away') => {
            const teamEvents = match.events ? match.events.filter((e: any) => e.team === teamType) : [];
            
            const body = teamEvents.map((e: any) => {
              const type = e.type.toLowerCase();
              const isGoal = type === 'gol' || type === 'goal';
              let cardText = '';
              if (type === 'tarjeta_amarilla' || type === 'yellow_card') cardText = 'TA';
              if (type === 'tarjeta_roja' || type === 'red_card') cardText = 'TR';

              return [
                '', // N
                e.player_name,
                isGoal ? '1' : '',
                cardText
              ];
            });

            // Rellenar hasta 12 filas
            while (body.length < 12) body.push(['', '', '', '']);
            return body;
          };

          const commonStyles = {
            theme: 'grid' as const,
            styles: { fontSize: 8, cellPadding: 1, lineColor: [0, 0, 0] as [number, number, number], lineWidth: 0.1 },
            headStyles: { fillColor: [255, 255, 255] as [number, number, number], textColor: [0, 0, 0] as [number, number, number], fontStyle: 'bold' as const, halign: 'center' as const },
            columnStyles: {
              0: { cellWidth: 8 as number | "auto", halign: 'center' as const },
              1: { cellWidth: 'auto' as number | "auto" },
              2: { cellWidth: 10 as number | "auto", halign: 'center' as const },
              3: { cellWidth: 10 as number | "auto", halign: 'center' as const }
            }
          };

          // Tabla Local
          autoTable(doc, {
            ...commonStyles,
            startY: currentY,
            margin: { left: 14, right: pageWidth / 2 + 2.5 },
            head: [['Nº', 'NOMBRE Y APELLIDOS', 'G', 'T']],
            body: getTableData('home'),
          });

          // Tabla Visitante
          autoTable(doc, {
            ...commonStyles,
            startY: currentY,
            margin: { left: pageWidth / 2 + 2.5, right: 14 },
            head: [['Nº', 'NOMBRE Y APELLIDOS', 'G', 'T']],
            body: getTableData('away'),
          });

          currentY = (doc as any).lastAutoTable.finalY + 15;

          // RESULTADO FINAL
          // RESULTADO FINAL (Centrado real)
          doc.setFont("helvetica", "bold");
          doc.setFontSize(12);
          
          // RESULTADO FINAL (Centrado real)
          doc.setFont("helvetica", "bold");
          doc.setFontSize(12);
          
          const leftCenter = 14 + (pageWidth / 2 - 14) / 2;
          const rightCenter = (pageWidth / 2) + (pageWidth / 2 - 14) / 2;

          // Local
          const leftBlockX = leftCenter - 25; // Aproximadamente la mitad del ancho del bloque
          doc.text("RESULTADO FINAL", leftBlockX, currentY);
          doc.rect(leftBlockX + 40, currentY - 6, 12, 9);
          doc.text(match.home_goals.toString(), leftBlockX + 46, currentY + 1, { align: 'center' });

          // Visitante
          const rightBlockX = rightCenter - 25;
          doc.text("RESULTADO FINAL", rightBlockX, currentY);
          doc.rect(rightBlockX + 40, currentY - 6, 12, 9);
          doc.text(match.away_goals.toString(), rightBlockX + 46, currentY + 1, { align: 'center' });

          // EQUIPO GANADOR
          currentY += 12;
          doc.setFontSize(14);
          let winnerText = "EMPATE";
          const homeName = match.home_team_name || match.home_team_placeholder || 'Local';
          const awayName = match.away_team_name || match.away_team_placeholder || 'Visitante';

          if (match.home_goals > match.away_goals) {
            winnerText = "VENCEDOR: " + homeName.toUpperCase();
          } else if (match.away_goals > match.home_goals) {
            winnerText = "VENCEDOR: " + awayName.toUpperCase();
          }
          
          doc.text(winnerText, pageWidth / 2, currentY, { align: 'center' });

          // OBSERVACIONES
          currentY += 18;
          doc.setFontSize(10);
          doc.text("OBSERVACIONES:", 14, currentY);
          doc.setFont("helvetica", "normal");
          doc.text(match.observations || '', 48, currentY);
          doc.line(48, currentY + 1, pageWidth - 14, currentY + 1);
        });

        doc.save('Dossier_Actas_Partido.pdf');
        this.isGeneratingPdf.set(false);
      },
      error: (err: any) => {
        console.error(err);
        Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo generar el dossier de actas.', background: '#1C1F26', color: '#EDEDED' });
        this.isGeneratingPdf.set(false);
      }
    });
  }

  downloadTeamsDossier() {
    this.isGeneratingTeamsPdf.set(true);
    const seasonId = this.seasonService.currentSeasonId();
    
    this.apiService.getSeasonTeamsReport(seasonId || undefined).subscribe({
      next: (teams: any[]) => {
        if (!teams || teams.length === 0) {
          Swal.fire({ icon: 'info', title: 'Atención', text: 'No hay equipos registrados en esta temporada.', background: '#1C1F26', color: '#EDEDED' });
          this.isGeneratingTeamsPdf.set(false);
          return;
        }

        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.width || doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.height || doc.internal.pageSize.getHeight();
        
        teams.forEach((team: any, index: number) => {
          if (index > 0) {
            doc.addPage();
          }

          const season = this.seasonService.getSelectedSeason();
          const seasonName = season?.name || 'Torneo de Fútbol Sala';
          const startDate = season?.start_date ? new Date(season.start_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' }) : '...';
          const endDate = season?.end_date ? new Date(season.end_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '...';
          const seasonDates = `Del ${startDate} al ${endDate}`;

          // CABECERA (Imagen 2)
          doc.setFont("helvetica", "bold");
          doc.setFontSize(16);
          doc.text("MEMORIAL FCO J. RIVERA MONTERO", pageWidth / 2, 20, { align: 'center' });
          doc.setFontSize(14);
          doc.text(seasonName.toUpperCase(), pageWidth / 2, 28, { align: 'center' });
          
          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
          doc.text(seasonDates, pageWidth / 2, 34, { align: 'center' });

          let currentY = 45;
          doc.setFontSize(11);
          
          // Campos de información (como en la imagen)
          doc.setFont("helvetica", "bold");
          doc.text("NOMBRE DEL EQUIPO:", 14, currentY);
          doc.setFont("helvetica", "normal");
          doc.text(team.name || '', 60, currentY);
          // Línea decorativa estilo formulario
          doc.line(60, currentY + 1, pageWidth - 14, currentY + 1);
          
          currentY += 10;
          doc.setFont("helvetica", "bold");
          doc.text("COLOR EQUIPACIÓN:", 14, currentY);
          doc.setFont("helvetica", "normal");
          doc.text(team.kit_color || '', 60, currentY);
          doc.line(60, currentY + 1, pageWidth - 14, currentY + 1);

          currentY += 10;
          doc.setFont("helvetica", "bold");
          doc.text("NOMBRE DEL REPRESENTANTE:", 14, currentY);
          doc.setFont("helvetica", "normal");
          doc.text(team.delegate || '', 82, currentY);
          doc.line(82, currentY + 1, pageWidth - 14, currentY + 1);

          currentY += 10;
          doc.setFont("helvetica", "bold");
          doc.text("TELÉFONO:", 14, currentY);
          doc.setFont("helvetica", "normal");
          doc.text(team.phone || '', 45, currentY);
          doc.line(45, currentY + 1, 100, currentY + 1);
          
          doc.setFont("helvetica", "bold");
          doc.text("MÓVIL:", 110, currentY);
          doc.setFont("helvetica", "normal");
          doc.text(team.phone || '', 132, currentY);
          doc.line(132, currentY + 1, pageWidth - 14, currentY + 1);

          currentY += 10;
          doc.setFont("helvetica", "bold");
          doc.text("ENTRENADOR:", 14, currentY);
          doc.setFont("helvetica", "normal");
          doc.text(team.coach || '', 48, currentY);
          doc.line(48, currentY + 1, pageWidth - 14, currentY + 1);

          currentY += 15;

          // TABLA DE JUGADORES
          doc.setFont("helvetica", "bold");
          doc.text("RELACIÓN DE JUGADORES", pageWidth / 2, currentY, { align: 'center' });
          currentY += 5;

          const tableBody: any[][] = [];
          // Añadimos los jugadores reales
          if (team.players && team.players.length > 0) {
            team.players.forEach((p: any) => {
              tableBody.push([
                p.jersey_number || '',
                p.name || '',
                p.birth_date ? new Date(p.birth_date).toLocaleDateString('es-ES') : '',
                '' // Columna de tarjetas vacía para rellenar
              ]);
            });
          }
          
          // Rellenamos con filas vacías hasta llegar a 15-18 filas como en la imagen
          const minRows = 16;
          while (tableBody.length < minRows) {
            tableBody.push(['', '', '', '']);
          }

          autoTable(doc, {
            startY: currentY,
            head: [['DORSAL', 'NOMBRE Y APELLIDOS', 'FECHA NACTO', 'TARJETAS']],
            body: tableBody,
            theme: 'grid',
            headStyles: { 
              fillColor: [240, 240, 240] as [number, number, number], 
              textColor: [0, 0, 0] as [number, number, number], 
              fontStyle: 'bold',
              lineWidth: 0.1,
              lineColor: [0, 0, 0] as [number, number, number],
              halign: 'center'
            },
            styles: { 
              lineColor: [0, 0, 0] as [number, number, number], 
              lineWidth: 0.1, 
              textColor: [0, 0, 0] as [number, number, number],
              fontSize: 9,
              minCellHeight: 8
            },
            columnStyles: {
              0: { halign: 'center', cellWidth: 20 },
              1: { cellWidth: 100 },
              2: { halign: 'center', cellWidth: 35 },
              3: { cellWidth: 27 }
            },
            margin: { left: 14, right: 14 },
          });

          let finalY = (doc as any).lastAutoTable.finalY + 15;

          // NOTA IMPORTANTE (Imagen 2)
          doc.setFont("helvetica", "bold");
          doc.text("NOTA IMPORTANTE:", 14, finalY);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8.5);
          const legalText = "La inscripción no lleva implícito tener un seguro médico, ya que no existe en la actualidad normativa legal que imponga a las entidades locales la asistencia sanitaria respecto a los deportistas que participen en programas deportivos municipales no federados, siendo el propio usuario el que correrá con los gastos médicos en el caso de lesión o accidente deportivo por lo que cada participante debe contar con su seguro propio (Seguridad social o privado), tanto para dentro del terreno de juego, como para fuera. La organización de la liga local de fútbol sala no se responsabiliza de ninguna lesión, enfermedad, accidente o robo.";
          const splitText = doc.splitTextToSize(legalText, pageWidth - 28);
          doc.text(splitText, 14, finalY + 5);

          // Número de página
          doc.setFontSize(8);
          doc.text(`${index + 1}`, pageWidth - 20, pageHeight - 10);
        });

        doc.save('Dossier_Equipos_Relacion.pdf');
        this.isGeneratingTeamsPdf.set(false);
      },
      error: (err: any) => {
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
      next: (data: any) => {
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

          const tableBody = (teams as any[]).map((t: any, i: number) => [
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
            headStyles: { fillColor: [0, 174, 239] as [number, number, number], halign: 'center' },
            columnStyles: {
              0: { halign: 'center', fontStyle: 'bold' },
              1: { fontStyle: 'bold' },
              2: { halign: 'center', fontStyle: 'bold', textColor: [0, 174, 239] as [number, number, number] },
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
            headStyles: { fillColor: [247, 148, 29] as [number, number, number], halign: 'center' },
            columnStyles: {
              0: { halign: 'center', fontStyle: 'bold' },
              1: { fontStyle: 'bold' },
              2: { halign: 'center', fontStyle: 'bold', textColor: [247, 148, 29] as [number, number, number] },
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
      error: (err: any) => {
        console.error(err);
        Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo generar el dossier de clasificación.', background: '#1C1F26', color: '#EDEDED' });
        this.isGeneratingStandingsPdf.set(false);
      }
    });
  }
}
