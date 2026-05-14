import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MatchVoting } from './match-voting';

describe('MatchVoting', () => {
  let component: MatchVoting;
  let fixture: ComponentFixture<MatchVoting>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MatchVoting]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MatchVoting);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
