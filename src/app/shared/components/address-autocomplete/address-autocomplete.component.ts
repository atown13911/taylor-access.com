import { Component, Output, EventEmitter, signal, inject, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AddressLookupService, AddressResult } from '../../../core/services/address-lookup.service';

@Component({
  selector: 'app-address-autocomplete',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './address-autocomplete.component.html',
  styleUrls: ['./address-autocomplete.component.scss']
})
export class AddressAutocompleteComponent {
  private addressService = inject(AddressLookupService);
  
  @Input() placeholder = 'Start typing address...';
  @Input() value = '';
  @Output() addressSelected = new EventEmitter<AddressResult>();
  @Output() valueChange = new EventEmitter<string>();
  
  searchQuery = signal('');
  suggestions = signal<AddressResult[]>([]);
  showSuggestions = signal(false);
  loading = signal(false);
  
  async onInput(value: string) {
    this.searchQuery.set(value);
    this.valueChange.emit(value);
    
    if (value.length < 5) {
      this.suggestions.set([]);
      this.showSuggestions.set(false);
      return;
    }
    
    this.loading.set(true);
    const results = await this.addressService.searchAddresses(value);
    this.suggestions.set(results);
    this.showSuggestions.set(results.length > 0);
    this.loading.set(false);
  }
  
  selectAddress(address: AddressResult) {
    this.searchQuery.set(address.formattedAddress);
    this.showSuggestions.set(false);
    this.addressSelected.emit(address);
  }
  
  onBlur() {
    // Delay to allow click on suggestion
    setTimeout(() => this.showSuggestions.set(false), 200);
  }
  
  onFocus() {
    if (this.suggestions().length > 0) {
      this.showSuggestions.set(true);
    }
  }
}
