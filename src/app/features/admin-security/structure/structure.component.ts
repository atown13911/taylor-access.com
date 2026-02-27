import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OrganizationsComponent } from '../organizations/organizations.component';
import { DivisionsComponent } from '../divisions/divisions.component';
import { DepartmentsComponent } from '../departments/departments.component';
import { PositionsComponent } from '../positions/positions.component';
import { SatellitesComponent } from '../satellites/satellites.component';
import { AgenciesComponent } from '../agencies/agencies.component';
import { TerminalsComponent } from '../terminals/terminals.component';
import { JobTitlesComponent } from '../../recruiting/job-titles/job-titles.component';
type StructureTab = 'organizations' | 'divisions' | 'departments' | 'positions' | 'terminals' | 'job_titles' | 'satellites' | 'agencies';

@Component({
  selector: 'app-structure',
  standalone: true,
  imports: [CommonModule, OrganizationsComponent, DivisionsComponent, DepartmentsComponent, PositionsComponent, SatellitesComponent, AgenciesComponent, TerminalsComponent, JobTitlesComponent],
  template: `
    <div class="structure-page">
      <div class="structure-tabs">
        <button class="structure-tab" [class.active]="activeTab() === 'organizations'" (click)="activeTab.set('organizations')">
          <i class="bx bx-buildings"></i> Organizations
        </button>
        <button class="structure-tab" [class.active]="activeTab() === 'divisions'" (click)="activeTab.set('divisions')">
          <i class="bx bx-git-branch"></i> Divisions
        </button>
        <button class="structure-tab" [class.active]="activeTab() === 'departments'" (click)="activeTab.set('departments')">
          <i class="bx bx-briefcase"></i> Departments
        </button>
        <button class="structure-tab" [class.active]="activeTab() === 'positions'" (click)="activeTab.set('positions')">
          <i class="bx bx-id-card"></i> Job Positions
        </button>
        <button class="structure-tab" [class.active]="activeTab() === 'job_titles'" (click)="activeTab.set('job_titles')">
          <i class="bx bx-purchase-tag"></i> Job Titles
        </button>
        <button class="structure-tab" [class.active]="activeTab() === 'terminals'" (click)="activeTab.set('terminals')">
          <i class="bx bx-package"></i> Terminals
        </button>
        <button class="structure-tab" [class.active]="activeTab() === 'satellites'" (click)="activeTab.set('satellites')">
          <i class="bx bx-building"></i> Satellites
        </button>
        <button class="structure-tab" [class.active]="activeTab() === 'agencies'" (click)="activeTab.set('agencies')">
          <i class="bx bx-store-alt"></i> Agencies
        </button>
      </div>

      <div class="structure-content">
        @switch (activeTab()) {
          @case ('organizations') {
            <app-organizations></app-organizations>
          }
          @case ('satellites') {
            <app-satellites></app-satellites>
          }
          @case ('agencies') {
            <app-agencies></app-agencies>
          }
          @case ('divisions') {
            <app-divisions></app-divisions>
          }
          @case ('departments') {
            <app-departments></app-departments>
          }
          @case ('positions') {
            <app-positions></app-positions>
          }
          @case ('job_titles') {
            <app-job-titles></app-job-titles>
          }
          @case ('terminals') {
            <app-terminals></app-terminals>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    .structure-page {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      margin-top: -24px;
    }

    .structure-tabs {
      display: flex;
      gap: 2px;
      padding: 24px 24px 0;
      margin: 0 -24px;
      background: var(--bg-primary, #050508);
      border-bottom: 1px solid var(--border-color, #2a2a4e);
      position: sticky;
      top: -24px;
      z-index: 100;
      overflow-x: auto;
    }

    .structure-tab {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 18px;
      border: none;
      background: transparent;
      color: #888;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.2s ease;
      white-space: nowrap;

      i { font-size: 1.05rem; }

      &:hover {
        color: #ccc;
        background: rgba(0, 212, 255, 0.03);
      }

      &.active {
        color: var(--cyan, #00d4ff);
        border-bottom-color: var(--cyan, #00d4ff);
        background: rgba(0, 212, 255, 0.05);
      }
    }

    .structure-content {
      flex: 1;
    }
  `]
})
export class StructureComponent {
  activeTab = signal<StructureTab>('organizations');
}
