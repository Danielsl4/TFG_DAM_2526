import { Component, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './layout.html',
  styleUrl: './layout.css',
})
export class Layout {
  @ViewChild('adminNavContainer') adminNavContainer!: ElementRef;

  scrollAdminNav(amount: number) {
    if (this.adminNavContainer) {
      this.adminNavContainer.nativeElement.scrollBy({
        left: amount,
        behavior: 'smooth'
      });
    }
  }
}
