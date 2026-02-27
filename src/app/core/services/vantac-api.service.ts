import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class VanTacApiService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl;

  // Organizations
  getOrganizations(): Observable<any> {
    return this.http.get(`${this.baseUrl}${environment.api.organizations}`);
  }

  // Users
  createUser(data: any): Observable<any> {
    return this.http.post(`${this.baseUrl}${environment.api.users}`, data);
  }

  updateUser(id: string, data: any): Observable<any> {
    return this.http.put(`${this.baseUrl}${environment.api.users}/${id}`, data);
  }

  deleteUser(id: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}${environment.api.users}/${id}`);
  }

  // Password Reset
  requestPasswordReset(email: string): Observable<any> {
    return this.http.post(`${this.baseUrl}${environment.api.password}/reset`, { email });
  }

  // Roles
  getRoles(): Observable<any> {
    return this.http.get(`${this.baseUrl}${environment.api.roles}`);
  }

  // Invitations
  sendInvitation(data: any): Observable<any> {
    return this.http.post(`${this.baseUrl}${environment.api.invitations}`, data);
  }

  // Organization CRUD
  createOrganization(data: any): Observable<any> {
    return this.http.post(`${this.baseUrl}${environment.api.organizations}`, data);
  }

  updateOrganization(id: any, data: any): Observable<any> {
    return this.http.put(`${this.baseUrl}${environment.api.organizations}/${id}`, data);
  }

  deleteOrganization(id: any): Observable<any> {
    return this.http.delete(`${this.baseUrl}${environment.api.organizations}/${id}`);
  }

  getOrganizationUsers(id: any): Observable<any> {
    return this.http.get(`${this.baseUrl}${environment.api.organizations}/${id}/users`);
  }

  checkOrganizationData(): Observable<any> {
    return this.http.get(`${this.baseUrl}${environment.api.organizations}/check-data`);
  }

  fixOrganizationData(): Observable<any> {
    return this.http.post(`${this.baseUrl}${environment.api.organizations}/fix-data`, {});
  }

  // Users list
  getUsers(params?: any): Observable<any> {
    return this.http.get(`${this.baseUrl}${environment.api.users}`, { params });
  }

  // Divisions
  getDivisions(params?: any): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/divisions`, { params });
  }

  createDivision(data: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/v1/divisions`, data);
  }

  updateDivision(id: any, data: any): Observable<any> {
    return this.http.put(`${this.baseUrl}/api/v1/divisions/${id}`, data);
  }

  deleteDivision(id: any): Observable<any> {
    return this.http.delete(`${this.baseUrl}/api/v1/divisions/${id}`);
  }

  // Fleets (stub)
  getFleets(): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/divisions`);
  }

  // Drivers
  getDrivers(params?: any): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/drivers`, { params });
  }

  getDriver(id: any): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/drivers/${id}`);
  }

  createDriver(data: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/v1/drivers`, data);
  }

  updateDriver(id: any, data: any): Observable<any> {
    return this.http.put(`${this.baseUrl}/api/v1/drivers/${id}`, data);
  }

  updateDriverLocation(id: any, lat: any, lng?: any): Observable<any> {
    const data = lng !== undefined ? { latitude: lat, longitude: lng } : lat;
    return this.http.put(`${this.baseUrl}/api/v1/drivers/${id}/location`, data);
  }

  getDriverTerminals(driverId: any): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/driver-terminals?driverId=${driverId}`);
  }

  // Vehicles
  getVehicles(params?: any): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/vehicles`, { params });
  }

  createVehicle(data: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/v1/vehicles`, data);
  }

  updateVehicle(id: any, data: any): Observable<any> {
    return this.http.put(`${this.baseUrl}/api/v1/vehicles/${id}`, data);
  }

  // Contacts/Carriers
  getContacts(params?: any): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/contacts`, { params });
  }

  createCarrier(data: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/v1/contacts`, data);
  }

  updateCarrier(id: any, data: any): Observable<any> {
    return this.http.put(`${this.baseUrl}/api/v1/contacts/${id}`, data);
  }
}
