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
}
