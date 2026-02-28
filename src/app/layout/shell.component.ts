import { Component, signal, computed, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../core/services/auth.service';

interface NavSection {
  label?: string;
  items: { label: string; icon: string; route: string }[];
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterModule, DatePipe],
  templateUrl: './shell.component.html',
  styleUrls: ['./shell.component.scss']
})
export class ShellComponent implements OnInit, OnDestroy {
  authService = inject(AuthService);
  private router = inject(Router);

  sidebarCollapsed = signal(false);
  profileMenuOpen = signal(false);
  showOrgDropdown = signal(false);
  currentUser = this.authService.currentUser;
  currentTime = new Date();
  private clockInterval: any;

  tickerUpdates = [
    { id: 1, type: 'driver', message: 'Aaron Mathis CDL expires Jul 11, 2026' },
    { id: 2, type: 'compliant', message: 'Alexander Quevedo medical cert renewed' },
    { id: 3, type: 'warning', message: 'Chris Teaford license expiring in 28 days' },
    { id: 4, type: 'employee', message: 'New employee Adaleta Aličković added to roster' },
    { id: 5, type: 'access', message: 'VanTac TMS connected via SSO' },
    { id: 6, type: 'expired', message: 'David Parrott drug test overdue' },
    { id: 7, type: 'compliant', message: 'Loren Perry MVR check completed' },
    { id: 8, type: 'driver', message: 'Hayward Feaster Jr assigned to Landmark Trucking' },
    { id: 9, type: 'warning', message: '2 insurance policies expiring this month' },
    { id: 10, type: 'access', message: 'Taylor CRM authenticated via Taylor Access' },
  ];

  avatarUrl = computed(() => {
    const user = this.currentUser();
    const url = user?.avatarUrl || user?.avatar;
    if (!url) return null;
    if (url.startsWith('data:') || url.startsWith('http')) return url;
    return null;
  });

  navSections: NavSection[] = [
    {
      items: [
        { label: 'Dashboard', icon: 'bx bx-grid-alt', route: '/dashboard' },
        { label: 'Employee Roster', icon: 'bx bx-id-card', route: '/hr/roster' },
        { label: 'Drivers', icon: 'bx bx-car', route: '/drivers' },
        { label: 'Benefits', icon: 'bx bx-star', route: '/hr/benefits' },
        { label: 'Performance Reviews', icon: 'bx bx-bar-chart-alt-2', route: '/hr/performance-reviews' },
      ]
    },
    {
      label: 'Compliance',
      items: [
        { label: 'Driver Database', icon: 'bx bx-search-alt', route: '/compliance/driver-database' },
        { label: 'Registrations & Authority', icon: 'bx bx-certification', route: '/compliance/registrations' },
        { label: 'Insurance', icon: 'bx bx-shield-alt-2', route: '/compliance/insurance' },
        { label: 'Driver Qualification Files', icon: 'bx bx-folder-open', route: '/compliance/driver-files' },
        { label: 'Drug & Alcohol Testing', icon: 'bx bx-test-tube', route: '/compliance/drug-testing' },
        { label: 'Hours of Service (HOS)', icon: 'bx bx-time', route: '/compliance/hos' },
        { label: 'Vehicle Inspections', icon: 'bx bx-check-shield', route: '/compliance/vehicle-inspections' },
        { label: 'DOT Compliance', icon: 'bx bx-shield-alt-2', route: '/compliance/dot' },
      ]
    },
    {
      label: 'Admin',
      items: [
        { label: 'Users', icon: 'bx bx-user', route: '/users' },
        { label: 'Roles & Permissions', icon: 'bx bx-lock-alt', route: '/admin/roles' },
        { label: 'Audit Logs', icon: 'bx bx-history', route: '/admin/audit' },
        { label: 'Invite Users', icon: 'bx bx-user-plus', route: '/admin/invite' },
        { label: 'Connected Apps (SSO)', icon: 'bx bx-link', route: '/admin/apps' },
        { label: 'HR Documents', icon: 'bx bx-file', route: '/hr/documents' },
        { label: 'Structure', icon: 'bx bx-sitemap', route: '/structure' },
        { label: 'Database', icon: 'bx bx-data', route: '/database' },
      ]
    }
  ];

  ngOnInit(): void {
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/login']);
    }
    this.clockInterval = setInterval(() => this.currentTime = new Date(), 1000);
    this.restoreSavedStyles();
  }

  private restoreSavedStyles(): void {
    // Restore theme
    const theme = localStorage.getItem('ta_theme');
    if (theme) {
      const themes: any = {
        'tron-dark': { bg: '#050508', sidebar: '#0d0d1a' },
        'midnight': { bg: '#0a0e1a', sidebar: '#0d1225' },
        'carbon': { bg: '#1a1a1a', sidebar: '#222222' },
        'dark-emerald': { bg: '#0a100e', sidebar: '#0d1812' },
        'obsidian': { bg: '#000000', sidebar: '#0a0a0a' },
        'dark-purple': { bg: '#0e0a14', sidebar: '#150d1e' },
        'dark-red': { bg: '#100a0a', sidebar: '#1a0d0d' },
        'dark-orange': { bg: '#100e0a', sidebar: '#1a150d' },
      };
      const t = themes[theme];
      if (t) {
        document.documentElement.style.setProperty('--bg-primary', t.bg);
        document.documentElement.style.setProperty('--bg-secondary', t.sidebar);
        document.documentElement.style.setProperty('--bg-card', t.sidebar);
      }
    }

    // Restore accent color
    const accent = localStorage.getItem('ta_accent');
    if (accent) {
      const colors: any = { Cyan:'#00d4ff', Blue:'#0080ff', Green:'#00ff88', Purple:'#a855f7', Red:'#ff2a6d', Orange:'#ff6b35', Yellow:'#fbbf24', Pink:'#ec4899', Teal:'#14b8a6', White:'#ffffff' };
      const val = colors[accent];
      if (val) {
        document.documentElement.style.setProperty('--cyan', val);
        document.documentElement.style.setProperty('--cyan-bright', val);
        document.documentElement.style.setProperty('--border-color', `${val}26`);
        document.documentElement.style.setProperty('--border-bright', `${val}4d`);
        document.documentElement.style.setProperty('--accent-10', `${val}1a`);
        document.documentElement.style.setProperty('--accent-15', `${val}26`);
        document.documentElement.style.setProperty('--accent-20', `${val}33`);
      }
    }

    // Restore font size
    const fontSize = localStorage.getItem('ta_font_size');
    if (fontSize) {
      const sizes: any = { small: '13px', medium: '14px', large: '16px' };
      document.documentElement.style.fontSize = sizes[fontSize] || '14px';
    }

    // Restore background
    setTimeout(() => {
      const bg = localStorage.getItem('ta_bg');
      const mainContent = document.querySelector('.main-content') as HTMLElement;
      if (!bg || bg === 'none' || !mainContent) return;

      const bgOpacity = parseInt(localStorage.getItem('ta_bg_opacity') || '60') / 100;

      if (bg.startsWith('solid-')) {
        const solidVal = localStorage.getItem('ta_bg_solid');
        if (solidVal) mainContent.style.background = solidVal;
      } else if (bg === 'custom') {
        const custom = localStorage.getItem('ta_bg_custom');
        if (custom) {
          mainContent.style.backgroundImage = `linear-gradient(rgba(5,5,8,${bgOpacity}), rgba(5,5,8,${Math.min(bgOpacity+0.1,1)})), url(${custom})`;
          mainContent.style.backgroundSize = 'cover';
          mainContent.style.backgroundPosition = 'center';
        }
      } else {
        // picsum backgrounds - reconstruct URL from ID mappings
        const bgUrls: any = {
          'forest-bg':'15','mountain-bg':'29','ocean-bg':'1015','river-bg':'1025','lake-bg':'1036','waterfall-bg':'1053','desert-bg':'274','beach-bg':'188',
          'skyline-bg':'1044','neon-bg':'399','bridge-bg':'122','rain-bg':'1039','street-bg':'258','roof-bg':'1058','tunnel-bg':'256','highway-bg':'1062',
          'abstract-bg':'1069','texture-bg':'984','blur-bg':'631','geometric-bg':'366','gradient-bg':'201','pattern-bg':'60','smoke-bg':'250','waves-bg':'139',
          'galaxy-bg':'631','nebula-bg':'984','stars-bg':'733','aurora-bg':'1057','moon-bg':'683','cosmos-bg':'832','saturn-bg':'985','milkyway-bg':'1062',
        };
        const picsumId = bgUrls[bg];
        if (picsumId) {
          mainContent.style.backgroundImage = `linear-gradient(rgba(5,5,8,${bgOpacity}), rgba(5,5,8,${Math.min(bgOpacity+0.1,1)})), url(https://picsum.photos/id/${picsumId}/1920/1080)`;
          mainContent.style.backgroundSize = 'cover';
          mainContent.style.backgroundPosition = 'center';
        }
      }

      // Restore sidebar opacity
      const sidebarOpacity = parseInt(localStorage.getItem('ta_sidebar_opacity') || '90');
      if (sidebarOpacity < 100) {
        document.documentElement.style.setProperty('--sidebar-bg', `rgba(13, 13, 26, ${sidebarOpacity / 100})`);
        document.documentElement.style.setProperty('--topbar-bg', `rgba(8, 8, 15, ${sidebarOpacity / 100})`);
      }

      // Restore sidebar material
      const mat = localStorage.getItem('ta_material');
      if (mat && mat !== 'none') {
        const matOpacity = parseInt(localStorage.getItem('ta_material_opacity') || '40');
        const matUrls: any = {
          'dark-wood':'395','stone':'1040','concrete':'1026','marble':'1050','metal':'262','leather':'351','fabric':'139','carbon':'201',
          'forest-n':'15','moss':'145','leaves':'167','bamboo':'312','water-n':'1053','rocks':'188','snow':'1036','flowers':'152',
          'skyline':'1044','neon':'399','bridge':'122','street':'258','subway':'256','rain-city':'1039','rooftop':'274','traffic':'1058',
          'circuit':'60','code':'2','server':'180','keyboard':'119','fiber':'366','laptop':'0','hardware':'48','lens':'250',
          'galaxy':'631','nebula-s':'984','stars':'733','aurora':'1057','moon':'683','earth':'985','cosmos':'1062','eclipse':'832',
        };
        const sidebar = document.querySelector('.sidebar') as HTMLElement;
        const pId = matUrls[mat];
        if (sidebar && pId) {
          const o = 1 - (matOpacity / 100);
          sidebar.style.backgroundImage = `linear-gradient(rgba(13,13,26,${o}), rgba(13,13,26,${o})), url(https://picsum.photos/id/${pId}/800/1200)`;
          sidebar.style.backgroundSize = 'cover';
          sidebar.style.backgroundPosition = 'center';
        }
      }
    }, 100);
  }

  ngOnDestroy(): void {
    if (this.clockInterval) clearInterval(this.clockInterval);
  }

  toggleSidebar(): void {
    this.sidebarCollapsed.update(v => !v);
  }

  toggleProfileMenu(): void {
    this.profileMenuOpen.update(v => !v);
  }

  closeProfileMenu(): void {
    this.profileMenuOpen.set(false);
  }

  logout(): void {
    this.closeProfileMenu();
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
