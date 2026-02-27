import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ToastService } from '../../../core/services/toast.service';
import { environment } from '../../../../environments/environment';

interface Organization {
  id: number;
  name: string;
}

interface JobPosition {
  id: number;
  name?: string;
  title?: string;
  code?: string;
}

@Component({
  selector: 'app-hr-documents',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './hr-documents.component.html',
  styleUrls: ['./hr-documents.component.scss']
})
export class HrDocumentsComponent {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private apiUrl = environment.apiUrl;

  activeTab = signal<'tab1' | 'tab2'>('tab1');

  // === Tab 2: Required Docs Tree ===
  treeOrgs = signal<any[]>([]);
  treeDivisions = signal<any[]>([]);
  treeDepartments = signal<any[]>([]);
  treePositions = signal<any[]>([]);
  expandedNodes = signal<Set<string>>(new Set());
  selectedTreeNode = signal<{ type: string; id: number; name: string } | null>(null);
  treeDocuments = signal<any[]>([]);
  treeLoading = signal(false);

  loadTreeData(): void {
    this.treeLoading.set(true);
    this.http.get<any>(`${environment.apiUrl}/api/v1/organizations`).subscribe({
      next: (res) => this.treeOrgs.set(res?.data || []),
      error: () => this.treeOrgs.set([])
    });
    this.http.get<any>(`${environment.apiUrl}/api/v1/divisions?limit=500`).subscribe({
      next: (res) => this.treeDivisions.set(res?.data || []),
      error: () => this.treeDivisions.set([])
    });
    this.http.get<any>(`${environment.apiUrl}/api/v1/departments?pageSize=500&adminReport=true&includeAll=true`).subscribe({
      next: (res) => this.treeDepartments.set(res?.data || []),
      error: () => this.treeDepartments.set([])
    });
    this.http.get<any>(`${environment.apiUrl}/api/v1/positions?adminReport=true&includeAll=true&pageSize=500`).subscribe({
      next: (res) => { this.treePositions.set(res?.data || []); this.treeLoading.set(false); },
      error: () => { this.treePositions.set([]); this.treeLoading.set(false); }
    });
  }

  toggleNode(key: string): void {
    this.expandedNodes.update(set => {
      const next = new Set(set);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  isExpanded(key: string): boolean {
    return this.expandedNodes().has(key);
  }

  selectNode(type: string, id: number, name: string): void {
    this.selectedTreeNode.set({ type, id, name });
    this.treeDocuments.set([]);
  }

  selectedNodeDocs(): { id?: number; name: string; description: string; categoryName: string }[] {
    const sel = this.selectedTreeNode();
    if (!sel) return [];
    
    if (sel.type === 'cat') {
      // Show docs from the selected category only
      const cat = this.docCategories().find(c => c.id === sel.id);
      return (cat?.docs || []).map(d => ({ ...d, categoryName: cat?.name || '' }));
    }
    
    if (sel.type === 'available') {
      // Show all docs from all categories
      const allDocs: any[] = [];
      for (const cat of this.docCategories()) {
        for (const doc of cat.docs) {
          allDocs.push({ ...doc, categoryName: cat.name });
        }
      }
      return allDocs;
    }
    
    // For org/div/dept/pos nodes, show empty for now
    return [];
  }

  isSelected(type: string, id: number): boolean {
    const sel = this.selectedTreeNode();
    return sel?.type === type && sel?.id === id;
  }

  getDivisionsForOrg(orgId: number): any[] {
    return this.treeDivisions().filter(d => d.organizationId === orgId);
  }

  getDepartmentsForOrg(orgId: number): any[] {
    return this.treeDepartments().filter(d => d.organizationId === orgId);
  }

  getPositionsForDept(deptId: number): any[] {
    return this.treePositions().filter(p => p.departmentId === deptId);
  }

  // Step 1: Organization Selection
  organizations = signal<Organization[]>([]);
  selectedOrganization = signal<Organization | null>(null);
  
  // Step 2: Category Selection (Satellite, Agency, or Department)
  selectedCategory = signal<'satellite' | 'agency' | 'department' | null>(null);
  
  // Step 3: Actual Entity Selection (based on category)
  satellites = signal<any[]>([]);
  agencies = signal<any[]>([]);
  departments = signal<any[]>([]);
  selectedEntity = signal<any | null>(null);
  
  // Step 4: Job Position Selection
  jobPositions = signal<JobPosition[]>([]);
  selectedPosition = signal<JobPosition | null>(null);
  
  // Document categories (subfolders) with their documents - loaded from API
  docCategories = signal<{ id: number; name: string; docs: { id?: number; name: string; description: string }[] }[]>([]);

  // Required doc item IDs for the selected position (persisted via API)
  requiredDocItemIds = signal<number[]>([]);

  // Computed: full doc objects that are required
  requiredDocuments = signal<{ name: string; description: string }[]>([]);

  showAddDocModal = signal(false);
  addDocTargetCatId = signal<number | null>(null);
  newDocName = '';
  newDocDesc = '';
  editingCatId = signal<number | null>(null);
  editingCatName = '';

  // Inline doc renaming
  editingDocKey = signal<string | null>(null); // "catId:docIndex"
  editingDocName = '';

  async openAddCategory(): Promise<void> {
    try {
      const res: any = await this.http.post(`${this.apiUrl}/api/v1/document-categories`, { name: 'Untitled Folder' }).toPromise();
      const newCat = { id: res.data.id, name: res.data.name, docs: [] };
      this.docCategories.update(cats => [...cats, newCat]);
      this.expandedNodes.update(set => { const next = new Set(set); next.add('available'); return next; });
      this.editingCatId.set(newCat.id);
      this.editingCatName = 'Untitled Folder';
    } catch {
      // Fallback to local
      const newId = Date.now();
      this.docCategories.update(cats => [...cats, { id: newId, name: 'Untitled Folder', docs: [] }]);
      this.expandedNodes.update(set => { const next = new Set(set); next.add('available'); return next; });
      this.editingCatId.set(newId);
      this.editingCatName = 'Untitled Folder';
    }
  }

  startRenameCategory(catId: number, currentName: string): void {
    this.editingCatId.set(catId);
    this.editingCatName = currentName;
  }

  finishRenameCategory(catId: number): void {
    if (this.editingCatName.trim()) {
      this.docCategories.update(cats => cats.map(c => c.id === catId ? { ...c, name: this.editingCatName.trim() } : c));
      this.http.put(`${this.apiUrl}/api/v1/document-categories/${catId}`, { name: this.editingCatName.trim() }).subscribe();
    }
    this.editingCatId.set(null);
  }

  cancelRename(): void {
    const catId = this.editingCatId();
    if (catId) {
      const cat = this.docCategories().find(c => c.id === catId);
      if (cat && cat.name === 'Untitled Folder' && cat.docs.length === 0) {
        this.docCategories.update(cats => cats.filter(c => c.id !== catId));
        this.http.delete(`${this.apiUrl}/api/v1/document-categories/${catId}`).subscribe();
      }
    }
    this.editingCatId.set(null);
  }

  removeCategory(catId: number): void {
    this.docCategories.update(cats => cats.filter(c => c.id !== catId));
    this.http.delete(`${this.apiUrl}/api/v1/document-categories/${catId}`).subscribe();
  }

  // New document modal
  showNewDocModal = signal(false);
  newDocTargetCatId = signal<number | null>(null);
  newDocForm = { name: '', description: '' };

  openAddDocToCategory(catId: number): void {
    this.newDocTargetCatId.set(catId);
    this.newDocForm = { name: '', description: '' };
    this.showNewDocModal.set(true);
  }

  async saveNewDoc(): Promise<void> {
    const catId = this.newDocTargetCatId();
    if (!catId || !this.newDocForm.name.trim()) return;

    try {
      const res: any = await this.http.post(`${this.apiUrl}/api/v1/document-categories/${catId}/items`, {
        name: this.newDocForm.name.trim(),
        description: this.newDocForm.description.trim()
      }).toPromise();
      const newDoc = { id: res.data.id, name: res.data.name, description: res.data.description || '' };
      this.docCategories.update(cats => cats.map(c =>
        c.id === catId ? { ...c, docs: [...c.docs, newDoc] } : c
      ));
    } catch {
      this.docCategories.update(cats => cats.map(c =>
        c.id === catId ? { ...c, docs: [...c.docs, { name: this.newDocForm.name.trim(), description: this.newDocForm.description.trim() }] } : c
      ));
    }
    this.expandedNodes.update(set => { const next = new Set(set); next.add('cat_' + catId); next.add('available'); return next; });
    this.showNewDocModal.set(false);
  }

  getTargetCatName(): string {
    const catId = this.newDocTargetCatId();
    return this.docCategories().find(c => c.id === catId)?.name || '';
  }

  // Document settings modal
  showDocSettings = signal(false);
  docSettingsForm = { id: null as number | null, name: '', description: '', categoryName: '', categoryId: null as number | null };

  openDocSettings(doc: any): void {
    this.docSettingsForm = {
      id: doc.id || null,
      name: doc.name,
      description: doc.description || '',
      categoryName: doc.categoryName || '',
      categoryId: null
    };
    // Find which category this doc belongs to
    for (const cat of this.docCategories()) {
      if (cat.docs.some(d => d.name === doc.name && d.id === doc.id)) {
        this.docSettingsForm.categoryId = cat.id;
        this.docSettingsForm.categoryName = cat.name;
        break;
      }
    }
    this.showDocSettings.set(true);
  }

  async saveDocSettings(): Promise<void> {
    const { id, name, description, categoryId } = this.docSettingsForm;
    if (!name.trim()) return;

    if (id) {
      this.http.put(`${this.apiUrl}/api/v1/document-categories/items/${id}`, {
        name: name.trim(),
        description: description.trim()
      }).subscribe();
    }

    // Update locally
    this.docCategories.update(cats => cats.map(c => ({
      ...c,
      docs: c.docs.map(d => (d.id === id) ? { ...d, name: name.trim(), description: description.trim() } : d)
    })));
    this.showDocSettings.set(false);
  }

  async deleteDocFromSettings(): Promise<void> {
    const { id, categoryId } = this.docSettingsForm;
    if (!categoryId) return;

    if (id) {
      this.http.delete(`${this.apiUrl}/api/v1/document-categories/items/${id}`).subscribe();
    }

    this.docCategories.update(cats => cats.map(c =>
      c.id === categoryId ? { ...c, docs: c.docs.filter(d => d.id !== id) } : c
    ));
    this.showDocSettings.set(false);
  }

  startRenameDoc(catId: number, docIndex: number, currentName: string): void {
    this.editingDocKey.set(`${catId}:${docIndex}`);
    this.editingDocName = currentName;
  }

  finishRenameDoc(catId: number, docIndex: number): void {
    if (this.editingDocName.trim()) {
      const cat = this.docCategories().find(c => c.id === catId);
      const doc = cat?.docs[docIndex];
      this.docCategories.update(cats => cats.map(c => {
        if (c.id === catId) {
          const docs = [...c.docs];
          docs[docIndex] = { ...docs[docIndex], name: this.editingDocName.trim() };
          return { ...c, docs };
        }
        return c;
      }));
      // Persist rename to API
      if (doc?.id) {
        this.http.put(`${this.apiUrl}/api/v1/document-categories/items/${doc.id}`, { name: this.editingDocName.trim() }).subscribe();
      }
    }
    this.editingDocKey.set(null);
  }

  cancelRenameDoc(catId: number, docIndex: number): void {
    const cat = this.docCategories().find(c => c.id === catId);
    const doc = cat?.docs[docIndex];
    if (cat && doc?.name === 'Untitled Document') {
      this.docCategories.update(cats => cats.map(c =>
        c.id === catId ? { ...c, docs: c.docs.filter((_, i) => i !== docIndex) } : c
      ));
      if (doc?.id) {
        this.http.delete(`${this.apiUrl}/api/v1/document-categories/items/${doc.id}`).subscribe();
      }
    }
    this.editingDocKey.set(null);
  }

  isEditingDoc(catId: number, docIndex: number): boolean {
    return this.editingDocKey() === `${catId}:${docIndex}`;
  }

  removeRequiredDoc(index: number): void {
    this.requiredDocuments.update(docs => docs.filter((_, i) => i !== index));
  }

  isDocRequired(docName: string): boolean {
    return this.requiredDocuments().some(d => d.name === docName);
  }

  isDocRequiredById(docId: number | undefined): boolean {
    if (!docId) return false;
    return this.requiredDocItemIds().includes(docId);
  }

  toggleDocRequired(doc: { id?: number; name: string; description: string }, categoryName: string): void {
    if (!doc.id) return;
    let positionId = this.selectedPosition()?.id;
    
    // If no position selected, try to auto-select the first available position
    if (!positionId && this.jobPositions().length > 0) {
      const firstPos = this.jobPositions()[0];
      this.selectPosition(firstPos);
      positionId = firstPos.id;
    }
    
    if (!positionId) {
      this.toast.error('No positions available for this entity. Please create a position first.', 'No Position');
      return;
    }

    let ids: number[];
    if (this.isDocRequiredById(doc.id)) {
      ids = this.requiredDocItemIds().filter(id => id !== doc.id);
      this.requiredDocuments.update(docs => docs.filter(d => d.name !== doc.name));
    } else {
      ids = [...this.requiredDocItemIds(), doc.id];
      this.requiredDocuments.update(docs => [...docs, { name: doc.name, description: doc.description }]);
    }
    this.requiredDocItemIds.set(ids);

    this.http.post(`${this.apiUrl}/api/v1/document-categories/position/${positionId}/requirements`, { itemIds: ids }).subscribe({
      next: () => this.toast.success(`${doc.name} requirement updated`, 'Saved'),
      error: (err: any) => {
        console.error('Failed to save requirement:', err);
        this.toast.error(err?.error?.message || 'Failed to save document requirement', 'Error');
      }
    });
  }

  getCheckedCountForCat(cat: { docs: { id?: number; name: string }[] }): number {
    return cat.docs.filter(d => this.isDocRequiredById(d.id)).length;
  }

  openAddDocModal(): void {
    this.addDocTargetCatId.set(null);
    this.newDocName = '';
    this.newDocDesc = '';
    this.showAddDocModal.set(true);
  }

  addRequiredDoc(): void {
    if (!this.newDocName.trim()) return;
    const catId = this.addDocTargetCatId();
    if (catId !== null) {
      // Add to specific category
      this.docCategories.update(cats => cats.map(c =>
        c.id === catId ? { ...c, docs: [...c.docs, { name: this.newDocName.trim(), description: this.newDocDesc.trim() }] } : c
      ));
    } else {
      // Add to flat list (tab 1)
      this.requiredDocuments.update(docs => [...docs, { name: this.newDocName.trim(), description: this.newDocDesc.trim() }]);
    }
    this.showAddDocModal.set(false);
  }

  removeDocFromCategory(catId: number, docIndex: number): void {
    const cat = this.docCategories().find(c => c.id === catId);
    const doc = cat?.docs[docIndex];
    this.docCategories.update(cats => cats.map(c =>
      c.id === catId ? { ...c, docs: c.docs.filter((_, i) => i !== docIndex) } : c
    ));
    if (doc?.id) {
      this.http.delete(`${this.apiUrl}/api/v1/document-categories/items/${doc.id}`).subscribe();
    }
  }

  // ==================== DRAG & DROP ====================
  dragSourceCatId = signal<number | null>(null);
  dragSourceDocIndex = signal<number | null>(null);
  dragOverCatId = signal<number | null>(null);

  onDragStartDoc(catId: number, docIndex: number, event: DragEvent): void {
    this.dragSourceCatId.set(catId);
    this.dragSourceDocIndex.set(docIndex);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', `${catId}:${docIndex}`);
    }
  }

  onDragOverFolder(catId: number, event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.dragOverCatId.set(catId);
  }

  onDragLeaveFolder(event: DragEvent): void {
    this.dragOverCatId.set(null);
  }

  onDropOnFolder(targetCatId: number, event: DragEvent): void {
    event.preventDefault();
    this.dragOverCatId.set(null);

    const sourceCatId = this.dragSourceCatId();
    const sourceDocIndex = this.dragSourceDocIndex();

    if (sourceCatId === null || sourceDocIndex === null) return;
    if (sourceCatId === targetCatId) return; // Same folder, no-op

    const cats = this.docCategories();
    const sourceCat = cats.find(c => c.id === sourceCatId);
    if (!sourceCat || sourceDocIndex >= sourceCat.docs.length) return;

    const doc = sourceCat.docs[sourceDocIndex];

    // Remove from source, add to target
    this.docCategories.update(categories => categories.map(c => {
      if (c.id === sourceCatId) {
        return { ...c, docs: c.docs.filter((_, i) => i !== sourceDocIndex) };
      }
      if (c.id === targetCatId) {
        return { ...c, docs: [...c.docs, doc] };
      }
      return c;
    }));

    // Persist move to API
    if (doc.id) {
      this.http.post(`${this.apiUrl}/api/v1/document-categories/items/${doc.id}/move`, { targetCategoryId: targetCatId }).subscribe();
    }

    this.dragSourceCatId.set(null);
    this.dragSourceDocIndex.set(null);
  }

  onDragEnd(): void {
    this.dragSourceCatId.set(null);
    this.dragSourceDocIndex.set(null);
    this.dragOverCatId.set(null);
  }
  
  // Loading state
  loading = signal(false);
  
  ngOnInit() {
    this.loadOrganizations();
    this.loadTreeData();
    this.loadDocCategories();
  }

  async reseedCategories(): Promise<void> {
    try {
      await this.http.post(`${this.apiUrl}/api/v1/document-categories/reseed`, {}).toPromise();
      this.loadDocCategories();
    } catch (err) {
      console.error('Failed to reseed:', err);
    }
  }

  loadDocCategories(): void {
    this.http.get<any>(`${this.apiUrl}/api/v1/document-categories`).subscribe({
      next: (res) => {
        const cats = (res.data || []).map((c: any) => ({
          id: c.id,
          name: c.name,
          docs: (c.docs || []).map((d: any) => ({ id: d.id, name: d.name, description: d.description || '' }))
        }));
        this.docCategories.set(cats);
      },
      error: () => { /* keep empty */ }
    });
  }
  
  loadOrganizations() {
    this.http.get<any>(`${environment.apiUrl}/api/v1/organizations`).subscribe({
      next: (res) => {
        this.organizations.set(res.data || []);
      },
      error: () => {
        this.organizations.set([]);
      }
    });
  }
  
  selectOrganization(org: Organization) {
    this.selectedOrganization.set(org);
    this.selectedCategory.set(null);
    this.selectedEntity.set(null);
    this.selectedPosition.set(null);
  }
  
  selectCategory(category: 'satellite' | 'agency' | 'department') {
    this.selectedCategory.set(category);
    this.selectedEntity.set(null);
    this.selectedPosition.set(null);
    
    // Load entities based on category
    const orgId = this.selectedOrganization()?.id;
    if (orgId) {
      if (category === 'satellite') {
        this.loadSatellites(orgId);
      } else if (category === 'agency') {
        this.loadAgencies(orgId);
      } else if (category === 'department') {
        this.loadDepartments(orgId);
      }
    }
  }
  
  loadSatellites(orgId: number) {
    this.http.get<any>(`${environment.apiUrl}/api/v1/satellites?organizationId=${orgId}`).subscribe({
      next: (res) => this.satellites.set(res.data || []),
      error: () => this.satellites.set([])
    });
  }
  
  loadAgencies(orgId: number) {
    this.http.get<any>(`${environment.apiUrl}/api/v1/agencies?organizationId=${orgId}`).subscribe({
      next: (res) => this.agencies.set(res.data || []),
      error: () => this.agencies.set([])
    });
  }
  
  loadDepartments(orgId: number) {
    this.http.get<any>(`${environment.apiUrl}/api/v1/departments?organizationId=${orgId}`).subscribe({
      next: (res) => this.departments.set(res.data || []),
      error: () => this.departments.set([])
    });
  }
  
  selectEntity(entity: any) {
    this.selectedEntity.set(entity);
    this.selectedPosition.set(null);
    
    this.loadJobPositions(entity);

    // For satellites/agencies: auto-select first position after loading
    const category = this.selectedCategory();
    if (category === 'satellite' || category === 'agency') {
      this.http.get<any>(`${environment.apiUrl}/api/v1/positions?pageSize=1000&adminReport=true&includeAll=true`).subscribe({
        next: (res) => {
          const positions = res.data || [];
          this.jobPositions.set(positions);
          if (positions.length > 0) {
            this.selectPosition(positions[0]);
          }
        }
      });
    }
  }
  
  loadJobPositions(entity?: any) {
    // Build query - filter by department if category is department
    const category = this.selectedCategory();
    let url = `${environment.apiUrl}/api/v1/positions?pageSize=1000`;
    
    if (category === 'department' && entity?.id) {
      url += `&departmentId=${entity.id}`;
    } else if (category === 'satellite' && entity?.id) {
      url += `&satelliteId=${entity.id}`;
    } else if (category === 'agency' && entity?.id) {
      url += `&agencyId=${entity.id}`;
    }
    
    this.http.get<any>(url).subscribe({
      next: (res) => {
        let positions = res.data || res || [];
        
        // Client-side fallback filter if API doesn't support query params
        if (category === 'department' && entity?.id && positions.length > 0) {
          const deptId = Number(entity.id);
          const filtered = positions.filter((p: any) => Number(p.departmentId) === deptId);
          // Only use filtered if it actually reduces the list (meaning API returned unfiltered)
          if (filtered.length > 0 || positions.some((p: any) => p.departmentId)) {
            positions = filtered;
          }
        }
        
        this.jobPositions.set(positions);
      },
      error: (err) => {
        console.error('Failed to load positions:', err);
        this.jobPositions.set([]);
      }
    });
  }
  
  selectPosition(position: JobPosition) {
    this.selectedPosition.set(position);
    this.loadPositionRequirements(position.id);
  }

  async loadPositionRequirements(positionId: number) {
    try {
      const res: any = await this.http.get(`${this.apiUrl}/api/v1/document-categories/position/${positionId}/requirements`).toPromise();
      this.requiredDocItemIds.set(res?.data?.itemIds || []);
      // Build the flat required docs list from the loaded IDs
      const ids = new Set(this.requiredDocItemIds());
      const docs: { name: string; description: string }[] = [];
      for (const cat of this.docCategories()) {
        for (const doc of cat.docs) {
          if (doc.id && ids.has(doc.id)) {
            docs.push({ name: doc.name, description: doc.description });
          }
        }
      }
      this.requiredDocuments.set(docs);
    } catch {
      this.requiredDocItemIds.set([]);
      this.requiredDocuments.set([]);
    }
  }
  
  resetSelection() {
    this.selectedOrganization.set(null);
    this.selectedCategory.set(null);
    this.selectedEntity.set(null);
    this.selectedPosition.set(null);
  }
  
  getCategoryIcon(type: string | null): string {
    switch(type) {
      case 'satellite': return 'bx-buildings';
      case 'agency': return 'bx-store-alt';
      case 'department': return 'bx-briefcase';
      default: return 'bx-folder';
    }
  }
  
  getCategoryName(type: string | null): string {
    switch(type) {
      case 'satellite': return 'Satellite';
      case 'agency': return 'Agency';
      case 'department': return 'Department';
      default: return '';
    }
  }
}
