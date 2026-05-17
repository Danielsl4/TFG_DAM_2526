import { Component, inject, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../../services/api-service';
import { SeasonService } from '../../../services/season-service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './users.html',
  styleUrl: './users.css'
})
export class Users implements OnInit {
  private apiService = inject(ApiService);
  private route = inject(ActivatedRoute);
  private seasonService = inject(SeasonService);

  users: any[] = [];
  total: number = 0;
  page: number = 1;
  limit: number = 10;
  search: string = '';
  loading: boolean = false;

  constructor() {}

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params['search']) {
        this.search = params['search'];
      }
      this.loadUsers();
    });
  }

  loadUsers() {
    this.loading = true;
    this.apiService.getAdminUsers(this.page, this.limit, this.search).subscribe({
      next: (data) => {
        this.users = data.users;
        this.total = data.total;
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading users', err);
        this.loading = false;
      }
    });
  }

  onSearch() {
    this.page = 1;
    this.loadUsers();
  }

  nextPage() {
    if (this.page * this.limit < this.total) {
      this.page++;
      this.loadUsers();
    }
  }

  prevPage() {
    if (this.page > 1) {
      this.page--;
      this.loadUsers();
    }
  }

  get totalPages(): number {
    return Math.ceil(this.total / this.limit);
  }

  editUser(user: any) {
    Swal.fire({
      title: 'Editar Usuario',
      html: `
        <div class="swal-form">
          <div class="swal-field">
            <label>Rol</label>
            <select id="swal-role" class="swal-select-custom">
              <option value="user" ${user.role === 'user' ? 'selected' : ''}>Usuario</option>
              <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Administrador</option>
              <option value="referee" ${user.role === 'referee' ? 'selected' : ''}>Árbitro</option>
            </select>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      confirmButtonColor: 'var(--secundario)',
      cancelButtonText: 'Cancelar',
      preConfirm: () => {
        const role = (document.getElementById('swal-role') as HTMLSelectElement).value;
        return { role };
      }
    }).then((result) => {
      if (result.isConfirmed) {
        const updateData = { ...result.value };

        this.apiService.updateAdminUser(user.id, updateData).subscribe({
          next: () => {
            Swal.fire('¡Actualizado!', 'El usuario ha sido actualizado para esta temporada.', 'success');
            this.loadUsers();
          },
          error: (err) => {
            Swal.fire('Error', err.error.message || 'No se pudo actualizar el usuario', 'error');
          }
        });
      }
    });
  }

  deleteUser(user: any) {
    Swal.fire({
      title: '¿Desactivar usuario?',
      text: `Vas a desactivar al usuario ${user.username}. Sus datos serán anonimizados y no podrá volver a entrar, pero su historial se mantendrá.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Sí, desactivar',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        this.apiService.deleteAdminUser(user.id).subscribe({
          next: () => {
            Swal.fire('¡Desactivado!', 'El usuario ha sido desactivado y anonimizado.', 'success');
            this.loadUsers();
          },
          error: (err) => {
            Swal.fire('Error', err.error.message || 'No se pudo eliminar el usuario', 'error');
          }
        });
      }
    });
  }

  verifyUser(user: any) {
    Swal.fire({
      title: '¿Verificar usuario manualmente?',
      text: `Vas a verificar la cuenta de ${user.username} de forma manual. Esto le permitirá iniciar sesión de inmediato.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: 'var(--secundario)',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Sí, verificar',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        Swal.showLoading();
        this.apiService.verifyAdminUser(user.id).subscribe({
          next: () => {
            Swal.fire('¡Verificado!', 'El usuario ha sido verificado correctamente.', 'success');
            this.loadUsers();
          },
          error: (err) => {
            Swal.fire('Error', err.error.message || 'No se pudo verificar el usuario', 'error');
          }
        });
      }
    });
  }

  copyVerificationLink(user: any) {
    if (!user.verification_token) return;
    const link = `${window.location.origin}/verify-email?token=${user.verification_token}`;
    
    navigator.clipboard.writeText(link).then(() => {
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
        title: 'Enlace copiado al portapapeles'
      });
    }).catch(err => {
      console.error('No se pudo copiar el enlace:', err);
      Swal.fire('Enlace de Verificación', link, 'info');
    });
  }
}
