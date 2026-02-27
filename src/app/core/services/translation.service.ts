import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { en } from './i18n/en';
import { bs } from './i18n/bs'; // Bosnian

export type Language = 'en' | 'bs';

export interface Translation {
  [key: string]: string | Translation;
}

@Injectable({
  providedIn: 'root'
})
export class TranslationService {
  private http = inject(HttpClient);
  
  // Current language
  currentLanguage = signal<Language>('en');
  
  // Translation dictionaries
  private translations: Record<Language, Translation> = {
    en: en,
    bs: bs
  };
  
  // User's organization country (determines language)
  organizationCountry = signal<string>('USA');
  
  constructor() {
    // Auto-detect language from organization country
    this.loadUserOrganizationCountry();
  }
  
  private async loadUserOrganizationCountry() {
    try {
      // Get current user
      const user: any = await this.http.get(`${environment.apiUrl}/api/v1/auth/me`).toPromise();
      
      if (user?.organizationId) {
        // Get organization to find country
        const org: any = await this.http.get(`${environment.apiUrl}/api/v1/organizations/${user.organizationId}`).toPromise();
        
        if (org?.data?.country) {
          this.organizationCountry.set(org.data.country);
          this.setLanguageFromCountry(org.data.country);
        }
      }
    } catch (err) {
      console.log('Could not load organization country, using English');
    }
  }
  
  private setLanguageFromCountry(country: string) {
    const countryLanguageMap: Record<string, Language> = {
      'Bosnia': 'bs',
      'Croatia': 'bs', // Croatian is similar to Bosnian
      'Serbia': 'bs', // Serbian is similar to Bosnian
      // All other countries default to English
    };
    
    const language = countryLanguageMap[country] || 'en';
    this.currentLanguage.set(language);
    console.log(`🌍 Language set to ${language} based on country: ${country}`);
  }
  
  /**
   * Get translated text by key
   * @param key - Dot-notation key like 'common.save' or 'dashboard.activeLoads'
   * @returns Translated text
   */
  t(key: string): string {
    const language = this.currentLanguage();
    const keys = key.split('.');
    let value: any = this.translations[language];
    
    for (const k of keys) {
      if (value && typeof value === 'object') {
        value = value[k];
      } else {
        // Fallback to English if key not found
        value = this.getFromDict(this.translations['en'], keys);
        break;
      }
    }
    
    return typeof value === 'string' ? value : key;
  }
  
  private getFromDict(dict: any, keys: string[]): string {
    let value = dict;
    for (const k of keys) {
      if (value && typeof value === 'object') {
        value = value[k];
      } else {
        return keys.join('.');
      }
    }
    return typeof value === 'string' ? value : keys.join('.');
  }
  
  /**
   * Manually set language
   */
  setLanguage(language: Language) {
    this.currentLanguage.set(language);
    localStorage.setItem('preferredLanguage', language);
  }
}
