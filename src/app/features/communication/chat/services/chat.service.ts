import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import * as signalR from '@microsoft/signalr';
import { environment } from '../../../../../environments/environment';

export interface ChatUser {
  id: string;
  name: string;
  email: string;
  status?: string;
}

export interface ChatMessage {
  id: string;
  content: string;
  type: string;
  createdAt: Date;
  editedAt?: Date;
  isPinned?: boolean;
  parentMessageId?: string;
  replyCount?: number;
  channelId?: string;
  conversationId?: string;
  sender: ChatUser;
  reactions?: { emoji: string; count: number; userIds: string[] }[];
}

export interface ChatChannel {
  id: string;
  name: string;
  slug: string;
  description?: string;
  type: string;
  icon?: string;
  lastMessageAt?: Date;
  memberCount: number;
  isMember: boolean;
  unreadCount: number;
}

export interface ChatConversation {
  id: string;
  type: string;
  name?: string;
  lastMessageAt?: Date;
  participants: { userId: string; user: ChatUser }[];
  lastMessage?: { content: string; createdAt: Date; senderName: string };
  unreadCount: number;
}

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private http = inject(HttpClient);
  private hubConnection: signalR.HubConnection | null = null;

  // State
  channels = signal<ChatChannel[]>([]);
  conversations = signal<ChatConversation[]>([]);
  currentMessages = signal<ChatMessage[]>([]);
  onlineUsers = signal<ChatUser[]>([]);
  typingUsers = signal<{ userId: string; name: string }[]>([]);
  
  // Current selection
  activeChannelId = signal<string | null>(null);
  activeConversationId = signal<string | null>(null);
  
  // Connection state
  isConnected = signal(false);
  connectionError = signal<string | null>(null);

  // Computed
  totalUnread = computed(() => {
    const channelUnread = this.channels().reduce((sum, c) => sum + c.unreadCount, 0);
    const dmUnread = this.conversations().reduce((sum, c) => sum + c.unreadCount, 0);
    return channelUnread + dmUnread;
  });

  private get authHeaders(): HttpHeaders {
    const token = localStorage.getItem('vantac_token');
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });
  }

  private get apiUrl(): string {
    return environment.apiUrl || 'http://localhost:5000';
  }

  /**
   * Initialize SignalR connection
   */
  async connect(): Promise<void> {
    if (this.hubConnection?.state === signalR.HubConnectionState.Connected) {
      return;
    }

    const token = localStorage.getItem('vantac_token');
    if (!token) {
      this.connectionError.set('Please log in to use Comm Link');
      // Still try to load channels via REST
      await this.loadChannels();
      return;
    }

    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(`${this.apiUrl}/hubs/chat`, {
        accessTokenFactory: () => token
      })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(signalR.LogLevel.Information)
      .build();

    // Set up event handlers
    this.setupEventHandlers();

    try {
      await this.hubConnection.start();
      this.isConnected.set(true);
      this.connectionError.set(null);
      console.log('Connected to Comm Link');
    } catch (error) {
      console.error('Failed to connect to Comm Link SignalR:', error);
      this.connectionError.set('Real-time disabled');
      this.isConnected.set(false);
    }

    // Always load initial data via REST (works even if SignalR fails)
    await this.loadChannels();
    await this.loadConversations();
    await this.loadOnlineUsers();
  }

  /**
   * Disconnect from SignalR
   */
  async disconnect(): Promise<void> {
    if (this.hubConnection) {
      await this.hubConnection.stop();
      this.isConnected.set(false);
    }
  }

  private setupEventHandlers(): void {
    if (!this.hubConnection) return;

    // Receive channel message
    this.hubConnection.on('ReceiveChannelMessage', (message: ChatMessage) => {
      if (message.channelId === this.activeChannelId()) {
        this.currentMessages.update(msgs => [...msgs, message]);
      }
      // Update unread count for other channels
      this.channels.update(channels => 
        channels.map(c => c.id === message.channelId && c.id !== this.activeChannelId()
          ? { ...c, unreadCount: c.unreadCount + 1, lastMessageAt: new Date() }
          : c
        )
      );
    });

    // Receive direct message
    this.hubConnection.on('ReceiveDirectMessage', (message: any) => {
      if (message.conversationId === this.activeConversationId()) {
        this.currentMessages.update(msgs => [...msgs, message]);
      }
      // Update unread count
      this.conversations.update(convs =>
        convs.map(c => c.id === message.conversationId && c.id !== this.activeConversationId()
          ? { ...c, unreadCount: c.unreadCount + 1, lastMessageAt: new Date() }
          : c
        )
      );
    });

    // User typing
    this.hubConnection.on('UserTyping', (userId: string, name: string, channelId: string, conversationId: string) => {
      if (channelId === this.activeChannelId() || conversationId === this.activeConversationId()) {
        this.typingUsers.update(users => {
          if (!users.find(u => u.userId === userId)) {
            return [...users, { userId, name }];
          }
          return users;
        });
        // Remove after 3 seconds
        setTimeout(() => {
          this.typingUsers.update(users => users.filter(u => u.userId !== userId));
        }, 3000);
      }
    });

    // User stopped typing
    this.hubConnection.on('UserStoppedTyping', (userId: string) => {
      this.typingUsers.update(users => users.filter(u => u.userId !== userId));
    });

    // User status changed
    this.hubConnection.on('UserStatusChanged', (userId: string, status: string) => {
      this.onlineUsers.update(users => {
        if (status === 'offline') {
          return users.filter(u => u.id !== userId);
        }
        const existing = users.find(u => u.id === userId);
        if (existing) {
          return users.map(u => u.id === userId ? { ...u, status } : u);
        }
        return users;
      });
    });

    // Reaction added/removed
    this.hubConnection.on('ReactionAdded', (messageId: string, userId: string, emoji: string) => {
      this.currentMessages.update(msgs =>
        msgs.map(m => {
          if (m.id !== messageId) return m;
          const reactions = [...(m.reactions || [])];
          const existing = reactions.find(r => r.emoji === emoji);
          if (existing) {
            existing.count++;
            existing.userIds.push(userId);
          } else {
            reactions.push({ emoji, count: 1, userIds: [userId] });
          }
          return { ...m, reactions };
        })
      );
    });

    this.hubConnection.on('ReactionRemoved', (messageId: string, userId: string, emoji: string) => {
      this.currentMessages.update(msgs =>
        msgs.map(m => {
          if (m.id !== messageId) return m;
          const reactions = (m.reactions || [])
            .map(r => {
              if (r.emoji !== emoji) return r;
              return {
                ...r,
                count: r.count - 1,
                userIds: r.userIds.filter(id => id !== userId)
              };
            })
            .filter(r => r.count > 0);
          return { ...m, reactions };
        })
      );
    });

    // Reconnection
    this.hubConnection.onreconnecting(() => {
      this.isConnected.set(false);
      console.log('Reconnecting to Comm Link...');
    });

    this.hubConnection.onreconnected(() => {
      this.isConnected.set(true);
      console.log('Reconnected to Comm Link');
    });

    this.hubConnection.onclose(() => {
      this.isConnected.set(false);
    });
  }

  // ========== API Methods ==========

  async loadChannels(): Promise<void> {
    try {
      const channels = await this.http.get<ChatChannel[]>(
        `${this.apiUrl}/api/v1/chat/channels`,
        { headers: this.authHeaders }
      ).toPromise();
      this.channels.set(channels || []);
    } catch (error) {
      console.error('Failed to load channels:', error);
    }
  }

  async loadConversations(): Promise<void> {
    try {
      const conversations = await this.http.get<ChatConversation[]>(
        `${this.apiUrl}/api/v1/chat/conversations`,
        { headers: this.authHeaders }
      ).toPromise();
      this.conversations.set(conversations || []);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  }

  async loadOnlineUsers(): Promise<void> {
    try {
      const users = await this.http.get<ChatUser[]>(
        `${this.apiUrl}/api/v1/chat/users/online`,
        { headers: this.authHeaders }
      ).toPromise();
      this.onlineUsers.set(users || []);
    } catch (error) {
      console.error('Failed to load online users:', error);
    }
  }

  async openChannel(channelId: string): Promise<void> {
    this.activeChannelId.set(channelId);
    this.activeConversationId.set(null);
    this.currentMessages.set([]);

    try {
      const response = await this.http.get<any>(
        `${this.apiUrl}/api/v1/chat/channels/${channelId}`,
        { headers: this.authHeaders }
      ).toPromise();

      console.log('Channel response:', response);
      // Handle both 'messages' and 'Messages' (case sensitivity)
      const messages = response?.messages || response?.Messages || [];
      console.log('Messages loaded:', messages.length);
      this.currentMessages.set(messages);

      // Update unread count
      this.channels.update(channels =>
        channels.map(c => c.id === channelId ? { ...c, unreadCount: 0 } : c)
      );

      // Join SignalR group
      if (this.hubConnection) {
        await this.hubConnection.invoke('JoinChannel', channelId);
      }
    } catch (error) {
      console.error('Failed to open channel:', error);
    }
  }

  async openConversation(conversationId: string): Promise<void> {
    this.activeConversationId.set(conversationId);
    this.activeChannelId.set(null);
    this.currentMessages.set([]);

    try {
      const response = await this.http.get<any>(
        `${this.apiUrl}/api/v1/chat/conversations/${conversationId}`,
        { headers: this.authHeaders }
      ).toPromise();

      console.log('Conversation response:', response);
      // Handle both 'messages' and 'Messages' (case sensitivity)
      const messages = response?.messages || response?.Messages || [];
      console.log('Messages loaded:', messages.length);
      this.currentMessages.set(messages);

      // Update unread count
      this.conversations.update(convs =>
        convs.map(c => c.id === conversationId ? { ...c, unreadCount: 0 } : c)
      );
    } catch (error) {
      console.error('Failed to open conversation:', error);
    }
  }

  async sendMessage(content: string): Promise<void> {
    if (!this.hubConnection) return;

    try {
      if (this.activeChannelId()) {
        await this.hubConnection.invoke('SendChannelMessage', this.activeChannelId(), content, null);
      } else if (this.activeConversationId()) {
        await this.hubConnection.invoke('SendDirectMessage', this.activeConversationId(), content);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }

  async startTyping(): Promise<void> {
    if (!this.hubConnection) return;
    await this.hubConnection.invoke('StartTyping', this.activeChannelId(), this.activeConversationId());
  }

  async stopTyping(): Promise<void> {
    if (!this.hubConnection) return;
    await this.hubConnection.invoke('StopTyping', this.activeChannelId(), this.activeConversationId());
  }

  async addReaction(messageId: string, emoji: string): Promise<void> {
    if (!this.hubConnection) return;
    await this.hubConnection.invoke('AddReaction', messageId, emoji);
  }

  async removeReaction(messageId: string, emoji: string): Promise<void> {
    if (!this.hubConnection) return;
    await this.hubConnection.invoke('RemoveReaction', messageId, emoji);
  }

  async startDirectMessage(userId: string): Promise<string | null> {
    try {
      const response = await this.http.post<{ id: string }>(
        `${this.apiUrl}/api/v1/chat/conversations/dm/${userId}`,
        {},
        { headers: this.authHeaders }
      ).toPromise();

      if (response?.id) {
        await this.loadConversations();
        return response.id;
      }
      return null;
    } catch (error) {
      console.error('Failed to start DM:', error);
      return null;
    }
  }

  async createChannel(name: string, description?: string, type?: string): Promise<string | null> {
    try {
      const response = await this.http.post<{ id: string }>(
        `${this.apiUrl}/api/v1/chat/channels`,
        { name, description, type },
        { headers: this.authHeaders }
      ).toPromise();

      if (response?.id) {
        await this.loadChannels();
        return response.id;
      }
      return null;
    } catch (error) {
      console.error('Failed to create channel:', error);
      return null;
    }
  }

  async joinChannel(channelId: string): Promise<void> {
    try {
      await this.http.post(
        `${this.apiUrl}/api/v1/chat/channels/${channelId}/join`,
        {},
        { headers: this.authHeaders }
      ).toPromise();
      await this.loadChannels();
    } catch (error) {
      console.error('Failed to join channel:', error);
    }
  }

  async searchUsers(query: string): Promise<ChatUser[]> {
    try {
      const users = await this.http.get<ChatUser[]>(
        `${this.apiUrl}/api/v1/chat/users?search=${encodeURIComponent(query)}`,
        { headers: this.authHeaders }
      ).toPromise();
      return users || [];
    } catch (error) {
      console.error('Failed to search users:', error);
      return [];
    }
  }
}
