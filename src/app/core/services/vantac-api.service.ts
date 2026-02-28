import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
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

  // Profile
  getMe(): Observable<any> {
    return this.http.get(`${this.baseUrl}${environment.api.auth}/me`);
  }
  updateProfile(data: any): Observable<any> {
    return this.http.put(`${this.baseUrl}${environment.api.auth}/profile`, data);
  }
  uploadAvatar(data: any): Observable<any> {
    return this.http.post(`${this.baseUrl}${environment.api.auth}/avatar`, data);
  }
  deleteAvatar(): Observable<any> {
    return this.http.delete(`${this.baseUrl}${environment.api.auth}/avatar`);
  }
  changePassword(data: any): Observable<any> {
    return this.http.post(`${this.baseUrl}${environment.api.password}/change`, data);
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

  // Fleets
  getFleets(): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/fleets`);
  }

  getFleet(id: any): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/fleets/${id}`);
  }

  createFleet(data: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/v1/fleets`, data);
  }

  updateFleet(id: any, data: any): Observable<any> {
    return this.http.put(`${this.baseUrl}/api/v1/fleets/${id}`, data);
  }

  deleteFleet(id: any): Observable<any> {
    return this.http.delete(`${this.baseUrl}/api/v1/fleets/${id}`);
  }

  getFleetDrivers(fleetId: any): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/fleets/${fleetId}`).pipe(
      map((res: any) => ({ data: res?.data?.fleetDrivers || [] }))
    );
  }

  getFleetVehicles(fleetId: any): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/fleets/${fleetId}`).pipe(
      map((res: any) => ({ data: res?.data?.fleetVehicles || [] }))
    );
  }

  addDriverToFleet(fleetId: any, driverId: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/v1/fleets/${fleetId}/assign-driver`, { driverId });
  }

  removeDriverFromFleet(fleetId: any, driverId: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/v1/fleets/${fleetId}/remove-driver`, { driverId });
  }

  addVehicleToFleet(fleetId: any, vehicleId: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/v1/fleets/${fleetId}/assign-vehicle`, { vehicleId });
  }

  removeVehicleFromFleet(fleetId: any, vehicleId: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/v1/fleets/${fleetId}/remove-vehicle`, { vehicleId });
  }

  // Vehicles
  getVehicles(params?: any): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/vehicles`, { params });
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

  getDriverTerminals(params?: any): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/driver-terminals`, { params });
  }

  createDriverTerminal(data: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/v1/driver-terminals`, data);
  }

  updateDriverTerminal(id: any, data: any): Observable<any> {
    return this.http.put(`${this.baseUrl}/api/v1/driver-terminals/${id}`, data);
  }

  deleteDriverTerminal(id: any): Observable<any> {
    return this.http.delete(`${this.baseUrl}/api/v1/driver-terminals/${id}`);
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

  // Driver Documents
  getDriverDocuments(driverId?: any): Observable<any> {
    const params = driverId ? `?driverId=${driverId}` : '';
    return this.http.get(`${this.baseUrl}/api/v1/driver-documents${params}`);
  }
  getDriverDocumentSummary(driverId?: any): Observable<any> {
    const params = driverId ? `?driverId=${driverId}` : '';
    return this.http.get(`${this.baseUrl}/api/v1/driver-documents/summary${params}`);
  }
  createDriverDocument(data: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/v1/driver-documents`, data);
  }
  updateDriverDocument(id: any, data: any): Observable<any> {
    return this.http.put(`${this.baseUrl}/api/v1/driver-documents/${id}`, data);
  }
  deleteDriverDocument(id: any): Observable<any> {
    return this.http.delete(`${this.baseUrl}/api/v1/driver-documents/${id}`);
  }
  viewDriverDocumentFile(id: any): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/driver-documents/${id}/file`, { responseType: 'blob' as any });
  }
  downloadDriverDocumentFile(id: any): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/driver-documents/${id}/download`, { responseType: 'blob' as any });
  }
  uploadDriverDocument(driverId: any, formData: FormData): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/v1/driver-documents/upload/${driverId}`, formData);
  }

  // Driver Payments
  getDriverPayments(params?: any): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/driver-payments`, { params });
  }
  createDriverPayment(data: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/v1/driver-payments`, data);
  }
  updateDriverPayment(id: any, data: any): Observable<any> {
    return this.http.put(`${this.baseUrl}/api/v1/driver-payments/${id}`, data);
  }
  deleteDriverPayment(id: any): Observable<any> {
    return this.http.delete(`${this.baseUrl}/api/v1/driver-payments/${id}`);
  }

  // Insurance Policies
  getInsurancePolicies(params?: any): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/insurance-policies`, { params });
  }
  createInsurancePolicy(data: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/v1/insurance-policies`, data);
  }
  updateInsurancePolicy(id: any, data: any): Observable<any> {
    return this.http.put(`${this.baseUrl}/api/v1/insurance-policies/${id}`, data);
  }
  deleteInsurancePolicy(id: any): Observable<any> {
    return this.http.delete(`${this.baseUrl}/api/v1/insurance-policies/${id}`);
  }
  updateInsurancePolicyBilling(id: any, data: any): Observable<any> {
    return this.http.put(`${this.baseUrl}/api/v1/insurance-policies/${id}/billing`, data);
  }
  viewInsurancePolicyDoc(id: any): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/insurance-policies/${id}/document`, { responseType: 'blob' as any });
  }
  downloadInsurancePolicyDoc(id: any): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/insurance-policies/${id}/download`, { responseType: 'blob' as any });
  }

  // Insurance Enrollments
  getInsuranceEnrollments(params?: any): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/insurance-enrollments`, { params });
  }
  createInsuranceEnrollment(policyId: any, data?: any): Observable<any> {
    const body = data || policyId;
    const pid = data ? policyId : undefined;
    return this.http.post(`${this.baseUrl}/api/v1/insurance-enrollments`, pid ? { ...body, policyId: pid } : body);
  }
  updateInsuranceEnrollment(policyIdOrId: any, idOrData?: any, data?: any): Observable<any> {
    const id = data ? idOrData : policyIdOrId;
    const body = data || idOrData;
    return this.http.put(`${this.baseUrl}/api/v1/insurance-enrollments/${id}`, body);
  }
  deleteInsuranceEnrollment(policyIdOrId: any, id?: any): Observable<any> {
    const enrollmentId = id || policyIdOrId;
    return this.http.delete(`${this.baseUrl}/api/v1/insurance-enrollments/${enrollmentId}`);
  }
}
