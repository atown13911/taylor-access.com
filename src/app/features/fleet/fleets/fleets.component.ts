import { Component, OnInit, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { VanTacApiService } from '../../../core/services/vantac-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { environment } from '../../../../environments/environment';
import { ConfirmService } from '../../../core/services/confirm.service';

interface Fleet {
  id: string;
  name: string;
  description?: string;
  status: string;
  vehicleCount: number;
  driverCount: number;
  createdAt: string;
}

interface FleetDriver {
  id: string;
  driverId: string;
  driverName: string;
  status: string;
}

interface FleetVehicle {
  id: string;
  vehicleId: string;
  vehicleName: string;
  status: string;
}

interface Division {
  id: string;
  fleetId: number;
  fleetName: string;
  name: string;
  description?: string;
  status: string;
  managerName?: string;
  location?: string;
  driverCount: number;
}

interface DriverTerminalRow {
  id: string;
  divisionId: number;
  divisionName: string;
  fleetId: number;
  fleetName: string;
  name: string;
  description?: string;
  status: string;
  managerName?: string;
  location?: string;
  driverCount: number;
}

type PageTab = 'entities' | 'divisions' | 'terminals';

@Component({
  selector: 'app-fleets',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './fleets.component.html',
  styleUrls: ['./fleets.component.scss']
})
export class FleetsComponent implements OnInit {
  private api = inject(VanTacApiService);
  private toast = inject(ToastService);
  private http = inject(HttpClient);
  private confirm = inject(ConfirmService);

  employees = signal<any[]>([]);
  fleets = signal<Fleet[]>([]);
  selectedFleet = signal<Fleet | null>(null);
  fleetDrivers = signal<FleetDriver[]>([]);
  fleetVehicles = signal<FleetVehicle[]>([]);
  loading = signal(false);
  showAddModal = signal(false);
  showMembersModal = signal(false);
  selectedFleetForMembers = signal<Fleet | null>(null);
  availableDrivers = signal<any[]>([]);
  availableVehicles = signal<any[]>([]);
  memberTab = signal<'drivers' | 'vehicles'>('drivers');
  editingFleet = signal<Fleet | null>(null);
  saving = signal(false);
  formError = signal('');
  activeTab = signal<'drivers' | 'vehicles'>('drivers');

  formData = { name: '', description: '', status: 'active' };

  // Top-level page tab
  pageTab = signal<PageTab>('entities');

  // Division state
  divisions = signal<Division[]>([]);
  selectedDivisionFleetId = signal<string>('');
  showDivisionModal = signal(false);
  editingDivision = signal<Division | null>(null);
  savingDivision = signal(false);
  divisionFormError = signal('');
  divisionForm = { name: '', description: '', status: 'active', managerName: '', location: '', fleetId: '' };
  divisionModalFleetId = '';

  // Terminal state
  driverTerminals = signal<DriverTerminalRow[]>([]);
  selectedTerminalFleetId = signal<string>('');
  selectedTerminalDivisionId = signal<string>('');
  filteredTerminalDivisions = signal<Division[]>([]);
  showTerminalModal = signal(false);
  editingTerminal = signal<DriverTerminalRow | null>(null);
  savingTerminal = signal(false);
  terminalFormError = signal('');
  terminalForm = { name: '', description: '', status: 'active', managerName: '', location: '' };
  terminalModalFleetId = '';
  terminalModalDivisionId = '';
  terminalModalDivisions = signal<Division[]>([]);

  totalVehicles = computed(() => this.fleets().reduce((sum, f) => sum + (f.vehicleCount || 0), 0));
  totalDrivers = computed(() => this.fleets().reduce((sum, f) => sum + (f.driverCount || 0), 0));

  ngOnInit(): void {
    this.loadFleets();
    this.loadEmployees();
  }

  async loadEmployees() {
    try {
      const res: any = await this.http.get(`${environment.apiUrl}/api/v1/employee-roster?limit=500`).toPromise();
      this.employees.set(res?.data || []);
    } catch {
      this.employees.set([]);
    }
  }

  refreshCurrentTab() {
    if (this.pageTab() === 'entities') this.loadFleets();
    else if (this.pageTab() === 'divisions') this.loadDivisions();
    else if (this.pageTab() === 'terminals') this.loadDriverTerminals();
  }

  async loadFleets() {
    this.loading.set(true);
    try {
      const response = await this.api.getFleets().toPromise();
      const rawFleets = response?.data || response || [];
      const fleets = rawFleets.map((f: any) => ({
        ...f,
        vehicleCount: f.fleetVehicles?.length || 0,
        driverCount: f.fleetDrivers?.length || 0
      }));
      this.fleets.set(fleets);
    } catch (err) {
      console.error('Failed to load fleets:', err);
    } finally {
      this.loading.set(false);
    }
  }

  async selectFleet(fleet: Fleet) {
    this.selectedFleet.set(fleet);
    await this.loadFleetMembers(fleet.id);
  }

  async loadFleetMembers(fleetId: string) {
    try {
      const [drivers, vehicles] = await Promise.all([
        this.api.getFleetDrivers(fleetId).toPromise(),
        this.api.getFleetVehicles(fleetId).toPromise()
      ]);
      this.fleetDrivers.set(drivers?.data || drivers || []);
      this.fleetVehicles.set(vehicles?.data || vehicles || []);
    } catch (err) {
      console.error('Failed to load fleet members:', err);
    }
  }

  editFleet(event: Event, fleet: Fleet) {
    event.stopPropagation();
    this.editingFleet.set(fleet);
    this.formData = { name: fleet.name, description: fleet.description || '', status: fleet.status };
    this.showAddModal.set(true);
  }

  async openAddMembers(event: Event, fleet: Fleet) {
    event.stopPropagation();
    this.selectedFleetForMembers.set(fleet);
    this.showMembersModal.set(true);
    this.memberTab.set('drivers');
    
    try {
      const [driversRes, vehiclesRes]: any[] = await Promise.all([
        this.api.getDrivers().toPromise(),
        this.api.getVehicles().toPromise()
      ]);
      this.availableDrivers.set(driversRes?.data || driversRes || []);
      this.availableVehicles.set(vehiclesRes?.data || vehiclesRes || []);
    } catch {
      this.availableDrivers.set([]);
      this.availableVehicles.set([]);
    }
  }

  closeMembersModal() {
    this.showMembersModal.set(false);
    this.selectedFleetForMembers.set(null);
    this.availableDrivers.set([]);
    this.availableVehicles.set([]);
  }

  async addDriverToFleet(driver: any) {
    const fleet = this.selectedFleetForMembers();
    if (!fleet) {
      this.toast.error('No fleet selected', 'Error');
      return;
    }
    
    try {
      await this.api.addDriverToFleet(fleet.id, driver.id).toPromise();
      this.toast.success(`${driver.name} added to ${fleet.name}`, 'Driver Added');
      this.availableDrivers.update(list => list.filter(d => d.id !== driver.id));
      this.loadFleets();
      if (this.selectedFleet()?.id === fleet.id) {
        await this.loadFleetMembers(fleet.id);
      }
    } catch (err) {
      console.error('Failed to add driver to fleet:', err);
      this.toast.error('Failed to add driver to fleet', 'Error');
    }
  }

  async addVehicleToFleet(vehicle: any) {
    const fleet = this.selectedFleetForMembers();
    if (!fleet) {
      this.toast.error('No fleet selected', 'Error');
      return;
    }
    
    try {
      await this.api.addVehicleToFleet(fleet.id, vehicle.id).toPromise();
      this.toast.success(`${vehicle.name || vehicle.make + ' ' + vehicle.model} added to ${fleet.name}`, 'Vehicle Added');
      this.availableVehicles.update(list => list.filter(v => v.id !== vehicle.id));
      this.loadFleets();
      if (this.selectedFleet()?.id === fleet.id) {
        await this.loadFleetMembers(fleet.id);
      }
    } catch (err) {
      console.error('Failed to add vehicle to fleet:', err);
      this.toast.error('Failed to add vehicle to fleet', 'Error');
    }
  }

  async deleteFleet(event: Event, fleet: Fleet) {
    event.stopPropagation();
    const ok = await this.confirm.show({ message: `Delete fleet "${fleet.name}"?`, type: 'danger', confirmText: 'Delete' });
    if (!ok) return;
    try {
      await this.api.deleteFleet(fleet.id).toPromise();
      this.fleets.update(list => list.filter(f => f.id !== fleet.id));
      if (this.selectedFleet()?.id === fleet.id) {
        this.selectedFleet.set(null);
      }
    } catch (err) {
      console.error('Failed to delete fleet:', err);
    }
  }

  async removeDriver(driver: FleetDriver) {
    const ok = await this.confirm.show({ message: `Remove driver "${driver.driverName}" from fleet?`, type: 'danger', confirmText: 'Remove' });
    if (!ok) return;
    try {
      await this.api.removeDriverFromFleet(this.selectedFleet()!.id, driver.driverId).toPromise();
      this.fleetDrivers.update(list => list.filter(d => d.id !== driver.id));
    } catch (err) {
      console.error('Failed to remove driver:', err);
    }
  }

  async removeVehicle(vehicle: FleetVehicle) {
    const ok = await this.confirm.show({ message: `Remove vehicle "${vehicle.vehicleName}" from fleet?`, type: 'danger', confirmText: 'Remove' });
    if (!ok) return;
    try {
      await this.api.removeVehicleFromFleet(this.selectedFleet()!.id, vehicle.vehicleId).toPromise();
      this.fleetVehicles.update(list => list.filter(v => v.id !== vehicle.id));
    } catch (err) {
      console.error('Failed to remove vehicle:', err);
    }
  }

  closeModal() {
    this.showAddModal.set(false);
    this.editingFleet.set(null);
    this.formError.set('');
    this.formData = { name: '', description: '', status: 'active' };
  }

  async saveFleet() {
    if (!this.formData.name.trim()) {
      this.formError.set('Fleet name is required.');
      return;
    }

    this.saving.set(true);
    this.formError.set('');

    try {
      if (this.editingFleet()) {
        await this.api.updateFleet(this.editingFleet()!.id, this.formData).toPromise();
        this.toast.success('Fleet updated successfully', 'Fleet Updated');
      } else {
        await this.api.createFleet(this.formData).toPromise();
        this.toast.success('Fleet created successfully', 'Fleet Created');
      }
      this.closeModal();
      this.loadFleets();
    } catch (err: any) {
      console.error('Failed to save fleet:', err);
      const msg = err.error?.error || err.error?.message || 'Failed to save fleet.';
      this.formError.set(msg);
      this.toast.error(msg, 'Error');
    } finally {
      this.saving.set(false);
    }
  }

  // ========== DIVISIONS ==========

  onFleetFilterChange(fleetId: string): void {
    this.selectedDivisionFleetId.set(fleetId);
    this.loadDivisions();
  }

  async loadDivisions() {
    const fleetId = this.selectedDivisionFleetId();
    const params: any = {};
    if (fleetId) params.fleetId = +fleetId;

    try {
      const res = await this.api.getDivisions(params).toPromise();
      this.divisions.set(res?.data || []);
    } catch (err) {
      console.error('Failed to load divisions:', err);
      this.divisions.set([]);
    }
  }

  async openAddDivision() {
    if (this.fleets().length === 0) await this.loadFleets();
    if (this.employees().length === 0) await this.loadEmployees();
    this.editingDivision.set(null);
    this.divisionForm = { name: '', description: '', status: 'active', managerName: '', location: '', fleetId: '' };
    this.divisionModalFleetId = this.selectedDivisionFleetId() || '';
    this.divisionFormError.set('');
    this.showDivisionModal.set(true);
  }

  editDivision(division: Division): void {
    this.editingDivision.set(division);
    this.divisionForm = {
      name: division.name,
      description: division.description || '',
      status: division.status,
      managerName: division.managerName || '',
      location: division.location || '',
      fleetId: (division as any).fleetId ? String((division as any).fleetId) : ''
    };
    this.divisionFormError.set('');
    this.showDivisionModal.set(true);
  }

  closeDivisionModal(): void {
    this.showDivisionModal.set(false);
    this.editingDivision.set(null);
    this.divisionFormError.set('');
  }

  async saveDivision() {
    if (!this.divisionForm.name.trim()) {
      this.divisionFormError.set('Division name is required.');
      return;
    }

    const fleetId = this.editingDivision() ? '' : this.divisionModalFleetId;
    if (!fleetId && !this.editingDivision()) {
      this.divisionFormError.set('Please select a fleet.');
      return;
    }

    this.savingDivision.set(true);
    this.divisionFormError.set('');

    try {
      if (this.editingDivision()) {
        const updateData: any = { ...this.divisionForm };
        if (updateData.fleetId) updateData.fleetId = +updateData.fleetId;
        else delete updateData.fleetId;
        await this.api.updateDivision(this.editingDivision()!.id, updateData).toPromise();
        this.toast.success('Division updated', 'Updated');
      } else {
        await this.api.createDivision({ ...this.divisionForm, fleetId: +fleetId }).toPromise();
        this.toast.success('Division created', 'Created');
      }
      this.closeDivisionModal();
      this.loadDivisions();
    } catch (err: any) {
      const msg = err.error?.error || 'Failed to save division.';
      this.divisionFormError.set(msg);
      this.toast.error(msg, 'Error');
    } finally {
      this.savingDivision.set(false);
    }
  }

  async deleteDivision(division: Division) {
    const ok = await this.confirm.show({ message: `Delete division "${division.name}"? Drivers will be unassigned.`, type: 'danger', confirmText: 'Delete' });
    if (!ok) return;
    try {
      await this.api.deleteDivision(division.id).toPromise();
      this.toast.success('Division deleted', 'Deleted');
      this.loadDivisions();
    } catch (err) {
      console.error('Failed to delete division:', err);
      this.toast.error('Failed to delete division', 'Error');
    }
  }

  // ========== DRIVER TERMINALS ==========

  onTerminalFleetChange(fleetId: string): void {
    this.selectedTerminalFleetId.set(fleetId);
    this.selectedTerminalDivisionId.set('');
    // Load divisions for this fleet to populate division filter
    if (fleetId) {
      this.api.getDivisions({ fleetId: +fleetId }).subscribe({
        next: (res: any) => this.filteredTerminalDivisions.set(res?.data || []),
        error: () => this.filteredTerminalDivisions.set([])
      });
    } else {
      this.filteredTerminalDivisions.set([]);
    }
    this.loadDriverTerminals();
  }

  onTerminalDivisionChange(divisionId: string): void {
    this.selectedTerminalDivisionId.set(divisionId);
    this.loadDriverTerminals();
  }

  async loadDriverTerminals() {
    const params: any = {};
    const fleetId = this.selectedTerminalFleetId();
    const divisionId = this.selectedTerminalDivisionId();
    if (fleetId) params.fleetId = +fleetId;
    if (divisionId) params.divisionId = +divisionId;

    try {
      const res = await this.api.getDriverTerminals(params).toPromise();
      this.driverTerminals.set(res?.data || []);
    } catch {
      this.driverTerminals.set([]);
    }
  }

  async openAddTerminal() {
    if (this.fleets().length === 0) await this.loadFleets();
    if (this.employees().length === 0) await this.loadEmployees();
    this.editingTerminal.set(null);
    this.terminalForm = { name: '', description: '', status: 'active', managerName: '', location: '' };
    this.terminalModalFleetId = this.selectedTerminalFleetId() || '';
    this.terminalModalDivisionId = this.selectedTerminalDivisionId() || '';
    this.terminalFormError.set('');
    // Pre-load divisions if fleet is selected
    if (this.terminalModalFleetId) {
      this.api.getDivisions({ fleetId: +this.terminalModalFleetId }).subscribe({
        next: (res: any) => this.terminalModalDivisions.set(res?.data || []),
        error: () => this.terminalModalDivisions.set([])
      });
    } else {
      this.terminalModalDivisions.set([]);
    }
    this.showTerminalModal.set(true);
  }

  onTerminalModalFleetChange(fleetId: string): void {
    this.terminalModalFleetId = fleetId;
    this.terminalModalDivisionId = '';
    if (fleetId) {
      this.api.getDivisions({ fleetId: +fleetId }).subscribe({
        next: (res: any) => this.terminalModalDivisions.set(res?.data || []),
        error: () => this.terminalModalDivisions.set([])
      });
    } else {
      this.terminalModalDivisions.set([]);
    }
  }

  editTerminal(terminal: DriverTerminalRow): void {
    this.editingTerminal.set(terminal);
    this.terminalForm = {
      name: terminal.name,
      description: terminal.description || '',
      status: terminal.status,
      managerName: terminal.managerName || '',
      location: terminal.location || ''
    };
    this.terminalFormError.set('');
    this.showTerminalModal.set(true);
  }

  closeTerminalModal(): void {
    this.showTerminalModal.set(false);
    this.editingTerminal.set(null);
    this.terminalFormError.set('');
  }

  async saveTerminal() {
    if (!this.terminalForm.name.trim()) {
      this.terminalFormError.set('Terminal name is required.');
      return;
    }

    const divisionId = this.editingTerminal() ? '' : this.terminalModalDivisionId;
    const fleetId = this.editingTerminal() ? '' : this.terminalModalFleetId;
    if (!divisionId && !this.editingTerminal()) {
      this.terminalFormError.set('Please select a fleet and division.');
      return;
    }

    this.savingTerminal.set(true);
    this.terminalFormError.set('');

    try {
      if (this.editingTerminal()) {
        await this.api.updateDriverTerminal(this.editingTerminal()!.id, this.terminalForm).toPromise();
        this.toast.success('Terminal updated', 'Updated');
      } else {
        await this.api.createDriverTerminal({
          ...this.terminalForm,
          divisionId: +divisionId,
          fleetId: fleetId ? +fleetId : 0
        }).toPromise();
        this.toast.success('Terminal created', 'Created');
      }
      this.closeTerminalModal();
      this.loadDriverTerminals();
    } catch (err: any) {
      const msg = err.error?.error || 'Failed to save terminal.';
      this.terminalFormError.set(msg);
      this.toast.error(msg, 'Error');
    } finally {
      this.savingTerminal.set(false);
    }
  }

  async deleteTerminal(terminal: DriverTerminalRow) {
    const ok = await this.confirm.show({ message: `Delete terminal "${terminal.name}"? Drivers will be unassigned.`, type: 'danger', confirmText: 'Delete' });
    if (!ok) return;
    try {
      await this.api.deleteDriverTerminal(terminal.id).toPromise();
      this.toast.success('Terminal deleted', 'Deleted');
      this.loadDriverTerminals();
    } catch {
      this.toast.error('Failed to delete terminal', 'Error');
    }
  }
}
