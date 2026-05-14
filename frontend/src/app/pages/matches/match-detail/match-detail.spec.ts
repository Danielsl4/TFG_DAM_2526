import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MatchDetail } from './match-detail';

describe('MatchDetail', () => {
  let component: MatchDetail;
  let fixture: ComponentFixture<MatchDetail>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MatchDetail]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MatchDetail);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
