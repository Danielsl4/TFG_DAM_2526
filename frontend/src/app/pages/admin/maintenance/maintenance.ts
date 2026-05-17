import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../../services/api-service';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-maintenance',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './maintenance.html',
  styleUrl: './maintenance.css',
})
export class Maintenance implements OnInit {
  private apiService = inject(ApiService);

  orphanTeams: any[] = [];
  orphanPlayers: any[] = [];
  activeTab: 'teams' | 'players' = 'teams';
  loading: boolean = false;

  ngOnInit() {
    this.loadOrphans();
  }

  loadOrphans() {
    this.loading = true;
    if (this.activeTab === 'teams') {
      this.apiService.getOrphanTeams().subscribe({
        next: (teams) => {
          this.orphanTeams = teams;
          this.loading = false;
        },
        error: (err) => {
          console.error(err);
          this.loading = false;
        }
      });
    } else {
      this.apiService.getOrphanPlayers().subscribe({
        next: (players) => {
          this.orphanPlayers = players;
          this.loading = false;
        },
        error: (err) => {
          console.error(err);
          this.loading = false;
        }
      });
    }
  }

  switchTab(tab: 'teams' | 'players') {
    this.activeTab = tab;
    this.loadOrphans();
  }

  deleteTeamPermanent(team: any) {
    Swal.fire({
      title: '¿BORRADO DEFINITIVO?',
      text: `¿Estás seguro de que quieres borrar el equipo ${team.name} de forma PERMANENTE? Se borrará también su logo de la nube y no se podrá recuperar.`,
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
            this.loadOrphans();
          },
          error: (err) => {
            Swal.fire('No se pudo borrar', err.error.message || 'Error desconocido', 'error');
          }
        });
      }
    });
  }

  deletePlayerPermanent(player: any) {
    Swal.fire({
      title: '¿BORRADO DEFINITIVO?',
      text: `¿Estás seguro de que quieres borrar a ${player.name} de forma PERMANENTE? Se borrará también su foto de la nube y no se podrá recuperar.`,
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
            this.loadOrphans();
          },
          error: (err) => {
            Swal.fire('No se pudo borrar', err.error.message || 'Error desconocido', 'error');
          }
        });
      }
    });
  }
}
