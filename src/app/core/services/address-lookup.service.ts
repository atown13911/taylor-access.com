import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface AddressResult {
  formattedAddress: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  latitude?: number;
  longitude?: number;
}

@Injectable({
  providedIn: 'root'
})
export class AddressLookupService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;
  
  /**
   * Search for addresses as user types
   * @param query - Address string (e.g., "1717 las")
   * @returns Promise of address suggestions
   */
  async searchAddresses(query: string): Promise<AddressResult[]> {
    if (!query || query.length < 5) {
      return [];
    }
    
    try {
      // Call backend geocoder which uses OpenStreetMap Nominatim
      const response: any = await this.http.get(
        `${this.apiUrl}/api/v1/geocoder/search?query=${encodeURIComponent(query)}&limit=5`
      ).toPromise();
      
      const results = response?.results || [];
      return results.map((r: any) => this.parseGeocoderResult(r));
    } catch (err) {
      console.error('Address lookup failed:', err);
      return [];
    }
  }
  
  /**
   * Get autocomplete suggestions (optimized for dropdown)
   */
  async getAutocompleteSuggestions(input: string): Promise<AddressResult[]> {
    if (!input || input.length < 3) {
      return [];
    }
    
    try {
      const response: any = await this.http.get(
        `${this.apiUrl}/api/v1/geocoder/autocomplete?input=${encodeURIComponent(input)}&limit=8`
      ).toPromise();
      
      const suggestions = response?.suggestions || [];
      return suggestions.map((s: any) => ({
        formattedAddress: s.text || s.mainText || '',
        street: s.mainText || '',
        city: this.extractCity(s.secondaryText),
        state: this.extractState(s.secondaryText),
        zipCode: this.extractZip(s.secondaryText),
        country: 'USA',
        latitude: s.latitude,
        longitude: s.longitude
      }));
    } catch (err) {
      console.error('Autocomplete failed:', err);
      return [];
    }
  }
  
  /**
   * Geocode a full address to get lat/long
   */
  async geocodeAddress(address: string, city: string, state: string, zipCode: string): Promise<{ lat: number; lng: number } | null> {
    const fullAddress = `${address}, ${city}, ${state} ${zipCode}`;
    
    try {
      const response: any = await this.http.get(
        `${this.apiUrl}/api/v1/geocoder/search?query=${encodeURIComponent(fullAddress)}&limit=1`
      ).toPromise();
      
      const result = response?.results?.[0];
      if (result?.latitude && result?.longitude) {
        return {
          lat: result.latitude,
          lng: result.longitude
        };
      }
    } catch (err) {
      console.error('Geocoding failed:', err);
    }
    
    return null;
  }
  
  /**
   * Reverse geocode lat/long to address
   */
  async reverseGeocode(lat: number, lng: number): Promise<AddressResult | null> {
    try {
      const response: any = await this.http.get(
        `${this.apiUrl}/api/v1/geocoder/reverse?latitude=${lat}&longitude=${lng}`
      ).toPromise();
      
      return {
        formattedAddress: response?.displayName || '',
        street: response?.address?.street || '',
        city: response?.address?.city || '',
        state: response?.address?.state || '',
        zipCode: response?.address?.postalCode || '',
        country: response?.address?.country || 'USA',
        latitude: lat,
        longitude: lng
      };
    } catch (err) {
      console.error('Reverse geocoding failed:', err);
      return null;
    }
  }
  
  /**
   * Validate address format
   */
  async validateAddress(street: string, city: string, state: string, zipCode: string, country = 'USA'): Promise<{ isValid: boolean; suggestedAddress?: AddressResult }> {
    try {
      const response: any = await this.http.post(
        `${this.apiUrl}/api/v1/geocoder/validate`,
        { street, city, state, postalCode: zipCode, country }
      ).toPromise();
      
      return {
        isValid: response?.isValid || false,
        suggestedAddress: response?.verifiedAddress ? {
          formattedAddress: `${response.verifiedAddress.street}, ${response.verifiedAddress.city}, ${response.verifiedAddress.state} ${response.verifiedAddress.postalCode}`,
          street: response.verifiedAddress.street || '',
          city: response.verifiedAddress.city || '',
          state: response.verifiedAddress.state || '',
          zipCode: response.verifiedAddress.postalCode || '',
          country: response.verifiedAddress.country || 'USA',
          latitude: response.verifiedAddress.latitude,
          longitude: response.verifiedAddress.longitude
        } : undefined
      };
    } catch (err) {
      console.error('Address validation failed:', err);
      return { isValid: false };
    }
  }
  
  /**
   * Parse geocoder result from backend
   */
  private parseGeocoderResult(result: any): AddressResult {
    return {
      formattedAddress: result.displayName || '',
      street: result.address?.street || '',
      city: result.address?.city || '',
      state: result.address?.state || '',
      zipCode: result.address?.postalCode || '',
      country: result.address?.country || 'USA',
      latitude: result.latitude,
      longitude: result.longitude
    };
  }
  
  /**
   * Extract city from address string (e.g., "Dallas, TX 75201")
   */
  private extractCity(text: string): string {
    if (!text) return '';
    const parts = text.split(',');
    return parts[0]?.trim() || '';
  }
  
  /**
   * Extract state from address string
   */
  private extractState(text: string): string {
    if (!text) return '';
    const parts = text.split(',');
    if (parts.length < 2) return '';
    const statePart = parts[1]?.trim().split(' ')[0];
    return statePart || '';
  }
  
  /**
   * Extract ZIP code from address string
   */
  private extractZip(text: string): string {
    if (!text) return '';
    const zipMatch = text.match(/\b\d{5}(-\d{4})?\b/);
    return zipMatch?.[0] || '';
  }
  
  /**
   * Validate US ZIP code format
   */
  isValidZipCode(zip: string): boolean {
    return /^\d{5}(-\d{4})?$/.test(zip);
  }
  
  /**
   * Format phone number to US format
   */
  formatPhoneNumber(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length === 11 && digits[0] === '1') {
      return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    return phone;
  }
}
