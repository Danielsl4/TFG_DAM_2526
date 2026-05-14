import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-standings-table',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './standings-table.html',
  styleUrl: './standings-table.css',
})
export class StandingsTable {
  @Input() data: any[] = [];
  @Input() bestFourthId: number | null = null;
  @Input() showGroupColumn: boolean = false;
  @Input() isAdjusted: boolean = false;
}

