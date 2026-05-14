import { Component, inject, OnInit } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ApiService } from '../../services/api-service';
import { SeasonService } from '../../services/season-service';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-navbar-component',
  standalone: true,
  imports: [
    RouterLink,
    RouterLinkActive,
    DatePipe
  ],
  templateUrl: './navbar-component.html',
  styleUrl: './navbar-component.css',
})
export class NavbarComponent implements OnInit {

  // Inyectamos servicios
  private authService = inject(AuthService);
  private apiService = inject(ApiService);
  protected seasonService = inject(SeasonService);

  lastActivity: number | null = null;

  // Exponemos las señales de las temporadas
  protected seasons = this.seasonService.seasons;
  protected currentSeasonId = this.seasonService.currentSeasonId;

  // Exponemos las señales del servicio para la vista
  protected isAuthenticated = this.authService.isAuthenticated;
  protected isAdmin = this.authService.isAdmin;
  protected isReferee = this.authService.isReferee;

  ngOnInit(): void {
    this.loadLastActivity();
  }

  loadLastActivity(): void {
    this.apiService.getLastActivity().subscribe({
      next: (res) => {
        this.lastActivity = res.timestamp;
      },
      error: (err) => {
        console.error('Error cargando última actividad (Navbar):', err);
      }
    });
  }

  // Método para cerrar sesión
  onLogout(): void {
    this.authService.logout();
  }
}
