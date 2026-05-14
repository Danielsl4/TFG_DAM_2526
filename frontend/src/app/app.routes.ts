import { Routes } from '@angular/router';
import { Home } from './pages/home/home';
import { Standings } from './pages/standings/standings';
import { Matches } from './pages/matches/matches';
import { Statistics } from './pages/statistics/statistics';
import { LoginComponent } from './pages/user/login-component/login-component';
import { RegisterComponent } from './pages/user/register-component/register-component';
import { ProfileComponent } from './pages/user/profile-component/profile-component';
import { ForgotPassword } from './pages/user/forgot-password/forgot-password';
import { ResetPassword } from './pages/user/reset-password/reset-password';
import { VerifyEmail } from './pages/user/verify-email/verify-email';
import { noAuthGuard } from './guards/no-auth.guard';
import { authGuard } from './guards/auth.guard';
import { MatchDetail } from './pages/matches/match-detail/match-detail';
import { TeamDetail } from './pages/profile/team-detail/team-detail';
import { PlayerDetail } from './pages/profile/player-detail/player-detail';
import { LegalComponent } from './pages/legal-component/legal-component';
import { Layout } from './pages/admin/layout/layout';
import { Dashboard } from './pages/admin/dashboard/dashboard';
import { Teams } from './pages/admin/teams/teams';
import { Players } from './pages/admin/players/players';
import { Users as AdminUsers } from './pages/admin/users/users';
import { Competitions } from './pages/admin/competitions/competitions';
import { Logs } from './pages/admin/logs/logs';
import { adminGuard } from './guards/admin.guard';
import { NotFound } from './pages/not-found/not-found';

export const routes: Routes = [
  //Principales
  { path: '', component: Home },
  { path: 'standings', component: Standings },
  { path: 'legal', component: LegalComponent },

  //Partidos
  { path: 'matches', component: Matches },
  { path: 'matches/detail/:id', component: MatchDetail },

  //Estadisticas
  { path: 'statistics', component: Statistics },

  //Usuario
  { path: 'login', component: LoginComponent, canActivate: [noAuthGuard] },
  { path: 'register', component: RegisterComponent, canActivate: [noAuthGuard] },
  { path: 'forgot-password', component: ForgotPassword, canActivate: [noAuthGuard] },
  { path: 'reset-password', component: ResetPassword, canActivate: [noAuthGuard] },
  { path: 'verify-email', component: VerifyEmail, canActivate: [noAuthGuard] },
  { path: 'profile', component: ProfileComponent, canActivate: [authGuard] },

  //Perfiles
  { path: 'teams/:id', component: TeamDetail},
  { path: 'players/:id', component: PlayerDetail},

  //ADMINISTRACIÓN
  { 
    path: 'admin', 
    component: Layout,
    canActivate: [adminGuard],
    children: [
      { path: '', component: Dashboard },
      { path: 'teams', component: Teams },
      { path: 'players', component: Players },
      { path: 'users', component: AdminUsers },
      { path: 'competitions', component: Competitions },
      { path: 'logs', component: Logs },
    ]
  },

  { path: '**', component: NotFound }
];
