import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MatchCard } from './match-card';

describe('MatchCard', () => {
  let component: MatchCard;
  let fixture: ComponentFixture<MatchCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MatchCard]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MatchCard);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
