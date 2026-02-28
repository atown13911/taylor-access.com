import { Component, signal, inject, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { ChatService, ChatChannel, ChatConversation, ChatMessage, ChatUser } from './services/chat.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss']
})
export class ChatComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messagesContainer') messagesContainer!: ElementRef;
  @ViewChild('messageInput') messageInput!: ElementRef;

  chatService = inject(ChatService);
  private router = inject(Router);
  private http = inject(HttpClient);

  // Auth state
  isLoggedIn = computed(() => !!localStorage.getItem('vantac_token'));

  // UI State
  showSidebar = signal(true);
  showUserSearch = signal(false);
  showCreateChannel = signal(false);
  userSearchQuery = signal('');
  userSearchResults = signal<ChatUser[]>([]);
  newChannelName = signal('');
  newChannelDescription = signal('');
  messageText = signal('');
  
  // Emoji picker
  showEmojiPicker = signal(false);
  selectedMessageForReaction = signal<string | null>(null);
  commonEmojis = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🔥', '👀'];

  // Plus menu
  showPlusMenu = signal(false);
  showRoster = signal(false);
  rosterSearch = signal('');
  rosterUsers = signal<any[]>([]);
  rosterLoading = signal(false);

  // Attachments
  pendingAttachment = signal<File | null>(null);
  attachmentPreview = signal<string>('');
  isUploadingAttachment = signal(false);

  // DM Controls
  showMessageSearch = signal(false);
  showMoreOptions = signal(false);
  messageSearchQuery = signal('');
  messageSearchResults = signal<string[]>([]);

  // Shipment View
  showShipmentView = signal(false);
  shipments = signal<any[]>([]);
  shipmentsLoading = signal(false);
  shipmentSearch = signal('');
  shipmentStatusFilter = signal('');
  shipmentSortCol = signal('createdAt');
  shipmentSortDir = signal<'asc' | 'desc'>('desc');
  shipmentChatMenuId = signal<number | null>(null);

  // Gmail Panel
  showGmailPanel = signal(false);
  gmailConnected = signal(false);
  gmailMessages = signal<any[]>([]);
  gmailLoading = signal(false);
  gmailSearch = signal('');
  gmailFolder = signal('INBOX');
  gmailUnread = computed(() => this.gmailMessages().filter(m => !m.isRead).length);
  
  // Compose Modal
  showComposeModal = signal(false);
  composeSending = signal(false);
  composeForm = { to: '', cc: '', bcc: '', subject: '', body: '' };
  showCcBcc = signal(false);
  contactSuggestions = signal<any[]>([]);
  showSuggestions = signal(false);
  allContacts = signal<any[]>([]);

  private typingTimeout: any;
  private shouldScrollToBottom = false;

  ngOnInit(): void {
    this.chatService.connect();
    this.preloadGmail();
  }

  preloadGmail(): void {
    // Load Gmail in background so it's ready when user opens the panel
    this.http.get<any>(`${environment.apiUrl}/api/v1/gmail/my/profile`).subscribe({
      next: (res) => {
        if (res.email) {
          this.gmailConnected.set(true);
          this.showGmailPanel.set(true);
          this.loadGmailMessages();
        }
      },
      error: () => {
        // Try legacy status endpoint as fallback
        this.http.get<any>(`${environment.apiUrl}/api/v1/gmail/status`).subscribe({
          next: (res) => {
            this.gmailConnected.set(res.connected === true);
            if (res.connected) {
              this.showGmailPanel.set(true);
              this.loadGmailMessages();
            }
          }
        });
      }
    });
  }

  ngOnDestroy(): void {
    this.chatService.disconnect();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  // ========== Modal Handlers ==========

  openUserSearch(): void {
    this.showUserSearch.set(true);
  }

  // ========== Plus Menu & Roster ==========

  togglePlusMenu(): void {
    this.showPlusMenu.update(v => !v);
  }

  openNewChat(): void {
    this.showPlusMenu.set(false);
    this.showRoster.set(true);
    this.rosterSearch.set('');
    this.loadRoster();
  }

  closeRoster(): void {
    this.showRoster.set(false);
    this.rosterSearch.set('');
    this.rosterUsers.set([]);
  }

  async loadRoster(): Promise<void> {
    this.rosterLoading.set(true);
    try {
      const res: any = await this.http.get(`${environment.apiUrl}/api/v1/users?pageSize=200`).toPromise();
      this.rosterUsers.set(res?.data || []);
    } catch {
      // Fallback: use online users from chat service
      this.rosterUsers.set(this.chatService.onlineUsers().map(u => ({
        id: u.id, name: u.name, email: u.email || '', 
        position: '', department: '', status: u.status
      })));
    } finally {
      this.rosterLoading.set(false);
    }
  }

  getFilteredRoster(): any[] {
    const search = this.rosterSearch().toLowerCase();
    let users = this.rosterUsers();
    if (search) {
      users = users.filter((u: any) =>
        u.name?.toLowerCase().includes(search) ||
        u.email?.toLowerCase().includes(search) ||
        u.position?.title?.toLowerCase().includes(search) ||
        u.department?.name?.toLowerCase().includes(search)
      );
    }
    return users;
  }

  startChatWithEmployee(user: any): void {
    const chatUser: ChatUser = {
      id: user.id?.toString() || user.id,
      name: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      email: user.email,
      status: 'online'
    };
    this.startDM(chatUser);
    this.closeRoster();
  }

  closeUserSearch(): void {
    this.showUserSearch.set(false);
    this.userSearchQuery.set('');
    this.userSearchResults.set([]);
  }

  openCreateChannel(): void {
    this.showCreateChannel.set(true);
  }

  closeCreateChannel(): void {
    this.showCreateChannel.set(false);
    this.newChannelName.set('');
    this.newChannelDescription.set('');
  }

  openEmojiPicker(messageId: string): void {
    this.selectedMessageForReaction.set(messageId);
    this.showEmojiPicker.set(true);
  }

  closeEmojiPicker(): void {
    this.showEmojiPicker.set(false);
    this.selectedMessageForReaction.set(null);
  }

  // ========== Input Handlers ==========

  onMessageTextChange(value: string): void {
    this.messageText.set(value);
  }

  onUserSearchChange(value: string): void {
    this.userSearchQuery.set(value);
  }

  onNewChannelNameChange(value: string): void {
    this.newChannelName.set(value);
  }

  onNewChannelDescriptionChange(value: string): void {
    this.newChannelDescription.set(value);
  }

  // ========== Sidebar Navigation ==========

  selectChannel(channel: ChatChannel): void {
    this.chatService.openChannel(channel.id);
    this.shouldScrollToBottom = true;
  }

  selectConversation(conversation: ChatConversation): void {
    this.chatService.openConversation(conversation.id);
    this.shouldScrollToBottom = true;
  }

  getConversationName(conversation: ChatConversation): string {
    if (conversation.name) return conversation.name;
    // For DMs, show the other participant's name
    const currentUserId = this.getCurrentUserId();
    const other = conversation.participants.find(p => p.userId !== currentUserId);
    return other?.user.name || 'Unknown';
  }

  // ========== Messages ==========

  async sendMessage(): Promise<void> {
    const text = this.messageText().trim();
    const attachment = this.pendingAttachment();

    if (!text && !attachment) return;

    // If there's an attachment, upload it first then send message with link
    if (attachment) {
      this.isUploadingAttachment.set(true);
      try {
        const formData = new FormData();
        formData.append('file', attachment);

        const res: any = await this.http.post(
          `${environment.apiUrl}/api/v1/chat/upload`, formData
        ).toPromise().catch(() => null);

        const fileUrl = res?.fileUrl || URL.createObjectURL(attachment);
        const fileName = attachment.name;
        const fileSize = this.formatAttachmentSize(attachment.size);
        const isImage = attachment.type.startsWith('image/');

        // Send message with attachment info
        const msgContent = text
          ? `${text}\n📎 ${fileName} (${fileSize})`
          : `📎 ${fileName} (${fileSize})`;
        
        await this.chatService.sendMessage(msgContent);
      } catch (err) {
        console.error('Failed to upload attachment:', err);
      } finally {
        this.isUploadingAttachment.set(false);
        this.clearAttachment();
      }
    } else {
      await this.chatService.sendMessage(text);
    }

    this.messageText.set('');
    this.shouldScrollToBottom = true;
    this.chatService.stopTyping();
  }

  // ========== Attachments ==========

  onAttachFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || !input.files.length) return;

    const file = input.files[0];
    
    // Max 25MB
    if (file.size > 25 * 1024 * 1024) {
      alert('File too large. Maximum size is 25MB.');
      input.value = '';
      return;
    }

    this.pendingAttachment.set(file);

    // Generate preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => this.attachmentPreview.set(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      this.attachmentPreview.set('');
    }

    input.value = '';
  }

  clearAttachment(): void {
    this.pendingAttachment.set(null);
    this.attachmentPreview.set('');
  }

  getAttachmentIcon(file: File): string {
    if (file.type.startsWith('image/')) return 'bx-image';
    if (file.type === 'application/pdf') return 'bx-file-pdf';
    if (file.type.includes('word') || file.type.includes('document')) return 'bx-file-doc';
    if (file.type.includes('sheet') || file.type.includes('excel')) return 'bx-spreadsheet';
    return 'bx-file';
  }

  formatAttachmentSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  onMessageKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  onMessageInput(): void {
    this.chatService.startTyping();
    
    // Clear previous timeout
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
    
    // Stop typing after 2 seconds of no input
    this.typingTimeout = setTimeout(() => {
      this.chatService.stopTyping();
    }, 2000);
  }

  formatMessageTime(date: Date | string): string {
    const d = new Date(date);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();
    
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    if (isToday) {
      return `Today ${time}`;
    }
    if (isYesterday) {
      return `Yesterday ${time}`;
    }
    // Within this week
    const daysDiff = Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
    if (daysDiff < 7) {
      const dayName = d.toLocaleDateString([], { weekday: 'short' });
      return `${dayName} ${time}`;
    }
    // Older - show full date
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + time;
  }

  shouldShowDateSeparator(index: number): boolean {
    const messages = this.chatService.currentMessages();
    if (index === 0) return true;
    const current = new Date(messages[index].createdAt);
    const previous = new Date(messages[index - 1].createdAt);
    return current.toDateString() !== previous.toDateString();
  }

  getDateSeparator(date: Date | string): string {
    const d = new Date(date);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    if (isToday) return 'Today';
    if (isYesterday) return 'Yesterday';
    
    const daysDiff = Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
    if (daysDiff < 7) {
      return d.toLocaleDateString([], { weekday: 'long' });
    }
    return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  isMyMessage(message: ChatMessage): boolean {
    const myId = this.getCurrentUserId();
    // Compare with type coercion (sender.id could be number, myId is string)
    if (myId && String(message.sender.id) === String(myId)) return true;
    // Fallback: match by name
    const myName = this.getCurrentUserName();
    if (myName && message.sender.name === myName) return true;
    return false;
  }

  getTypingNames(): string {
    return this.chatService.typingUsers().map(u => u.name).join(', ');
  }

  // ========== Reactions ==========

  toggleReaction(messageId: string, emoji: string): void {
    const message = this.chatService.currentMessages().find(m => m.id === messageId);
    const reaction = message?.reactions?.find(r => r.emoji === emoji);
    const hasReacted = reaction?.userIds.includes(this.getCurrentUserId());

    if (hasReacted) {
      this.chatService.removeReaction(messageId, emoji);
    } else {
      this.chatService.addReaction(messageId, emoji);
    }
    this.closeEmojiPicker();
  }

  addReactionFromPicker(emoji: string): void {
    const messageId = this.selectedMessageForReaction();
    if (messageId) {
      this.toggleReaction(messageId, emoji);
    }
  }

  // ========== User Search / DMs ==========

  async searchUsers(): Promise<void> {
    const query = this.userSearchQuery();
    if (query.length < 2) {
      this.userSearchResults.set([]);
      return;
    }
    const results = await this.chatService.searchUsers(query);
    this.userSearchResults.set(results);
  }

  async startDM(user: ChatUser): Promise<void> {
    const conversationId = await this.chatService.startDirectMessage(user.id);
    if (conversationId) {
      this.chatService.openConversation(conversationId);
      this.closeUserSearch();
      this.shouldScrollToBottom = true;
    }
  }

  // ========== Channel Creation ==========

  async createChannel(): Promise<void> {
    const name = this.newChannelName().trim();
    if (!name) return;

    const channelId = await this.chatService.createChannel(
      name,
      this.newChannelDescription(),
      'public'
    );

    if (channelId) {
      this.chatService.openChannel(channelId);
      this.closeCreateChannel();
      this.shouldScrollToBottom = true;
    }
  }

  // ========== Helpers ==========

  private scrollToBottom(): void {
    if (this.messagesContainer?.nativeElement) {
      const el = this.messagesContainer.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }

  getCurrentUserId(): string {
    // Get from localStorage or auth service
    const token = localStorage.getItem('vantac_token');
    if (!token) return '';
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return String(payload.nameid || payload.sub || payload.userId || payload.id || payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'] || '');
    } catch {
      return '';
    }
  }

  getCurrentUserName(): string {
    const token = localStorage.getItem('vantac_token');
    if (!token) return '';
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.unique_name || payload.name || payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] || '';
    } catch {
      return '';
    }
  }

  getActiveTitle(): string {
    const channelId = this.chatService.activeChannelId();
    const conversationId = this.chatService.activeConversationId();

    if (channelId) {
      const channel = this.chatService.channels().find(c => c.id === channelId);
      return channel ? `# ${channel.name}` : '';
    }
    if (conversationId) {
      const conv = this.chatService.conversations().find(c => c.id === conversationId);
      return conv ? this.getConversationName(conv) : '';
    }
    return 'Select a conversation';
  }

  toggleSidebar(): void {
    this.showSidebar.update(v => !v);
  }

  getUserInitials(name: string | undefined | null): string {
    if (!name) return '?';
    return String(name).split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  }

  getStatusColor(status?: string): string {
    switch (status) {
      case 'online': return '#22c55e';
      case 'away': return '#eab308';
      case 'busy': return '#ef4444';
      default: return '#6b7280';
    }
  }

  // ========== DM Controls ==========

  startVideoCall(): void {
    // TODO: Implement WebRTC video call
    alert('Video calling coming soon! 📹');
  }

  startVoiceCall(): void {
    // TODO: Implement WebRTC voice call
    alert('Voice calling coming soon! 📞');
  }

  toggleMessageSearch(): void {
    this.showMessageSearch.update(v => !v);
    if (!this.showMessageSearch()) {
      this.messageSearchQuery.set('');
      this.messageSearchResults.set([]);
    }
  }

  onMessageSearchChange(query: string): void {
    this.messageSearchQuery.set(query);
    // Filter messages based on query
    if (query.length >= 2) {
      const results = this.chatService.currentMessages()
        .filter(m => m.content.toLowerCase().includes(query.toLowerCase()))
        .map(m => m.id);
      this.messageSearchResults.set(results);
    } else {
      this.messageSearchResults.set([]);
    }
  }

  toggleMoreOptions(): void {
    this.showMoreOptions.update(v => !v);
  }

  showPinnedMessages(): void {
    // TODO: Show pinned messages panel
    alert('Pinned messages coming soon! 📌');
  }

  viewUserProfile(): void {
    // TODO: Show user profile modal
    alert('User profile coming soon! 👤');
  }

  muteConversation(): void {
    // TODO: Implement mute functionality
    alert('Conversation muted! 🔇');
    this.showMoreOptions.set(false);
  }

  muteChannel(): void {
    // TODO: Implement channel mute
    alert('Channel muted! 🔇');
    this.showMoreOptions.set(false);
  }

  clearChat(): void {
    if (confirm('Are you sure you want to clear this chat? This cannot be undone.')) {
      // TODO: Implement clear chat
      alert('Chat cleared!');
    }
    this.showMoreOptions.set(false);
  }

  blockUser(): void {
    if (confirm('Are you sure you want to block this user?')) {
      // TODO: Implement block user
      alert('User blocked!');
    }
    this.showMoreOptions.set(false);
  }

  showChannelMembers(): void {
    // TODO: Show channel members modal
    alert('Channel members coming soon! 👥');
    this.showMoreOptions.set(false);
  }

  leaveChannel(): void {
    if (confirm('Are you sure you want to leave this channel?')) {
      // TODO: Implement leave channel via API
      alert('Left channel!');
    }
    this.showMoreOptions.set(false);
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }

  // ========== Shipment View ==========

  toggleShipmentView(): void {
    const opening = !this.showShipmentView();
    this.showShipmentView.set(opening);
    if (opening && this.shipments().length === 0) {
      this.loadShipments();
    }
  }

  loadShipments(): void {
    this.shipmentsLoading.set(true);
    let url = `${environment.apiUrl}/api/v1/shipments?pageSize=50`;
    const q = this.shipmentSearch();
    const status = this.shipmentStatusFilter();
    if (q) url += `&search=${encodeURIComponent(q)}`;
    if (status) url += `&status=${encodeURIComponent(status)}`;

    this.http.get<any>(url).subscribe({
      next: (res) => {
        this.shipments.set(res.data || res || []);
        this.shipmentsLoading.set(false);
      },
      error: () => { this.shipmentsLoading.set(false); }
    });
  }

  sortShipmentsBy(column: string): void {
    if (this.shipmentSortCol() === column) {
      this.shipmentSortDir.set(this.shipmentSortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.shipmentSortCol.set(column);
      this.shipmentSortDir.set('asc');
    }

    const col = this.shipmentSortCol();
    const dir = this.shipmentSortDir();
    const sorted = [...this.shipments()].sort((a, b) => {
      let valA = a[col] ?? a.driver?.name ?? '';
      let valB = b[col] ?? b.driver?.name ?? '';
      if (col === 'createdAt') {
        valA = new Date(valA).getTime() || 0;
        valB = new Date(valB).getTime() || 0;
      }
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();
      if (valA < valB) return dir === 'asc' ? -1 : 1;
      if (valA > valB) return dir === 'asc' ? 1 : -1;
      return 0;
    });
    this.shipments.set(sorted);
  }

  openShipmentDetail(shipment: any): void {
    this.router.navigate(['/shipments'], { queryParams: { id: shipment.id } });
  }

  toggleShipmentChatMenu(shipment: any, event: Event): void {
    event.stopPropagation();
    this.shipmentChatMenuId.set(this.shipmentChatMenuId() === shipment.id ? null : shipment.id);
  }

  sendShipmentToChannel(shipment: any, channel: any): void {
    const msg = `📦 Shipment ${shipment.tssNumber || '#' + shipment.id} | ${shipment.status || 'N/A'} | ${shipment.originCity || '?'} → ${shipment.destinationCity || '?'} | Driver: ${shipment.driverName || shipment.driver?.name || '—'} | Customer: ${shipment.customerName || shipment.customer?.name || '—'}`;
    this.selectChannel(channel);
    setTimeout(() => {
      this.messageText.set(msg);
      this.shipmentChatMenuId.set(null);
    }, 300);
  }

  sendShipmentToDM(shipment: any, conv: any): void {
    const msg = `📦 Shipment ${shipment.tssNumber || '#' + shipment.id} | ${shipment.status || 'N/A'} | ${shipment.originCity || '?'} → ${shipment.destinationCity || '?'} | Driver: ${shipment.driverName || shipment.driver?.name || '—'} | Customer: ${shipment.customerName || shipment.customer?.name || '—'}`;
    this.selectConversation(conv);
    setTimeout(() => {
      this.messageText.set(msg);
      this.shipmentChatMenuId.set(null);
    }, 300);
  }

  // ========== Gmail OAuth Config ==========
  private readonly GOOGLE_CLIENT_ID = '741255945672-rk2ou21mf5jm71kgge256n9gsbt26ivv.apps.googleusercontent.com';
  private readonly GOOGLE_REDIRECT_URI = 'https://van-tac-v2.pages.dev/communications/gmail/callback';
  private readonly GOOGLE_SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.labels',
    'https://www.googleapis.com/auth/contacts.readonly'
  ].join(' ');

  // ========== Gmail Panel ==========

  toggleGmailPanel(): void {
    this.showGmailPanel.set(!this.showGmailPanel());
  }

  switchGmailFolder(folder: string): void {
    this.gmailFolder.set(folder);
    this.gmailLoading.set(true);
    
    let url: string;
    if (folder === 'SENT') {
      url = `${environment.apiUrl}/api/v1/gmail/my/sent?maxResults=20`;
    } else if (folder === 'STARRED') {
      url = `${environment.apiUrl}/api/v1/gmail/my/starred?maxResults=20`;
    } else if (folder === 'ALL') {
      url = `${environment.apiUrl}/api/v1/gmail/my/search?q=&maxResults=20`;
    } else {
      url = `${environment.apiUrl}/api/v1/gmail/my/messages/label/${folder}?maxResults=20`;
    }
    
    this.http.get<any>(url).subscribe({
      next: (res) => {
        this.gmailMessages.set(res.data || []);
        this.gmailLoading.set(false);
      },
      error: () => { this.gmailLoading.set(false); }
    });
  }

  loadGmailMessages(): void {
    this.gmailLoading.set(true);
    this.http.get<any>(`${environment.apiUrl}/api/v1/gmail/my/inbox?maxResults=20`).subscribe({
      next: (res) => {
        this.gmailMessages.set(res.data || []);
        this.gmailLoading.set(false);
      },
      error: () => { this.gmailLoading.set(false); }
    });
  }

  searchGmailMessages(): void {
    const q = this.gmailSearch();
    if (!q) { this.loadGmailMessages(); return; }
    this.gmailLoading.set(true);
    this.http.get<any>(`${environment.apiUrl}/api/v1/gmail/messages?maxResults=20&q=${encodeURIComponent(q)}`).subscribe({
      next: (res) => {
        this.gmailMessages.set(res.data || []);
        this.gmailLoading.set(false);
      },
      error: () => { this.gmailLoading.set(false); }
    });
  }

  openGmailMessage(msg: any): void {
    this.router.navigate(['/communications/gmail'], { queryParams: { msgId: msg.id } });
  }

  connectGmailOAuth(): void {
    const url = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(this.GOOGLE_CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(this.GOOGLE_REDIRECT_URI)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(this.GOOGLE_SCOPES)}` +
      `&access_type=offline` +
      `&prompt=consent`;
    window.location.href = url;
  }

  navigateToGmail(): void {
    this.router.navigate(['/communications/gmail']);
  }

  navigateToGmailCompose(): void {
    this.showComposeModal.set(true);
    this.composeForm = { to: '', cc: '', bcc: '', subject: '', body: '' };
    this.showCcBcc.set(false);
    this.showSuggestions.set(false);
    if (this.allContacts().length === 0) this.loadContacts();
  }

  loadContacts(): void {
    // Load VanTac users as contacts
    this.http.get<any>(`${environment.apiUrl}/api/v1/users?pageSize=500`).subscribe({
      next: (res) => {
        const users = (res.data || res || []).map((u: any) => ({
          name: u.name,
          email: u.email
        })).filter((u: any) => u.email);
        this.allContacts.set(users);
      }
    });
  }

  onToInput(value: string): void {
    this.composeForm.to = value;
    if (value.length < 1) {
      this.showSuggestions.set(false);
      return;
    }
    const q = value.toLowerCase();
    const filtered = this.allContacts().filter(c =>
      c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q)
    ).slice(0, 8);
    this.contactSuggestions.set(filtered);
    this.showSuggestions.set(filtered.length > 0);
  }

  selectContact(contact: any): void {
    this.composeForm.to = contact.email;
    this.showSuggestions.set(false);
  }

  hideSuggestionsDelayed(): void {
    setTimeout(() => this.showSuggestions.set(false), 200);
  }

  closeCompose(): void {
    this.showComposeModal.set(false);
  }

  async sendCompose(): Promise<void> {
    if (!this.composeForm.to) {
      alert('To field is required');
      return;
    }
    this.composeSending.set(true);
    try {
      await this.http.post(`${environment.apiUrl}/api/v1/gmail/my/send`, {
        to: this.composeForm.to,
        cc: this.composeForm.cc || null,
        bcc: this.composeForm.bcc || null,
        subject: this.composeForm.subject,
        body: this.composeForm.body
      }).toPromise();
      alert('Email sent!');
      this.showComposeModal.set(false);
      this.loadGmailMessages();
    } catch (e: any) {
      alert(e?.error?.error || 'Failed to send email');
    } finally {
      this.composeSending.set(false);
    }
  }

  extractGmailName(address: string | null): string {
    if (!address) return 'Unknown';
    const match = address.match(/^"?([^"<]+)"?\s*<?/);
    if (match && match[1].trim()) return match[1].trim();
    return address.split('@')[0] || address;
  }

  formatGmailDate(internalDate: string | null): string {
    if (!internalDate) return '';
    const date = new Date(parseInt(internalDate));
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 86400000 && date.getDate() === now.getDate()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (diff < 604800000) {
      return date.toLocaleDateString([], { weekday: 'short' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
}
