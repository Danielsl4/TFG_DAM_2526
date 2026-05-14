import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Match } from '../../models/match.model';
import { MatchVoting } from '../match-voting/match-voting';

@Component({
  selector: 'app-match-card',
  imports: [CommonModule, RouterModule, MatchVoting],
  templateUrl: './match-card.html',
  styleUrl: './match-card.css',
})
export class MatchCard implements OnInit, OnDestroy {
  @Input() match: Match | any;
  
  countdownText: string = '';
  private timerInterval: any;

  ngOnInit(): void {
    if (this.match?.status === 'pendiente' || !this.match?.status) {
      this.startCountdown();
    }
  }

  ngOnDestroy(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  private startCountdown(): void {
    if (!this.match?.date) return;
    
    const targetDate = new Date(this.match.date).getTime();

    this.updateCountdown(targetDate);
    
    this.timerInterval = setInterval(() => {
      this.updateCountdown(targetDate);
    }, 1000);
  }

  private updateCountdown(targetDate: number): void {
    const now = new Date().getTime();
    const distance = targetDate - now;

    if (distance < 0) {
      this.countdownText = '';
      if (this.timerInterval) clearInterval(this.timerInterval);
      return;
    }

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

    const dStr = days > 0 ? `${days}d ` : '';
    const hStr = `${hours.toString().padStart(2, '0')}h `;
    const mStr = `${minutes.toString().padStart(2, '0')}m `;
    const sStr = `${seconds.toString().padStart(2, '0')}s`;

    this.countdownText = dStr + hStr + mStr + sStr;
  }
}
