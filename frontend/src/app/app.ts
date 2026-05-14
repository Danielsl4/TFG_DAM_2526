import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import {NavbarComponent} from './components/navbar-component/navbar-component';
import {FooterComponent} from './components/footer-component/footer-component';
import {SeasonSwitcher} from './components/season-switcher/season-switcher';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NavbarComponent, FooterComponent, SeasonSwitcher],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('frontend');
}
