import { Component, signal, OnInit, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-tickets',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="tickets-page">
      <!-- Main Tabs: Support Tickets / Requests / Audit -->
      <div class="main-tabs">
        <button class="main-tab" [class.active]="mainTab() === 'support_ticket'" (click)="switchMainTab('support_ticket')">
          <i class="bx bx-support"></i> Support Tickets
        </button>
        <button class="main-tab" [class.active]="mainTab() === 'request'" (click)="switchMainTab('request')">
          <i class="bx bx-task"></i> Requests
        </button>
        <button class="main-tab" [class.active]="mainTab() === 'audit'" (click)="switchMainTab('audit')">
          <i class="bx bx-list-check"></i> Audit
        </button>
      </div>

      <div class="page-header">
        <div>
          <h1><i class="bx" [class.bx-support]="mainTab() === 'support_ticket'" [class.bx-task]="mainTab() === 'request'" [class.bx-list-check]="mainTab() === 'audit'"></i> {{ mainTab() === 'support_ticket' ? 'Support Tickets' : mainTab() === 'request' ? 'Requests' : 'Audit' }}</h1>
          <p>{{ mainTab() === 'support_ticket' ? 'Issue tracking and helpdesk' : mainTab() === 'request' ? 'Internal requests and approvals' : 'All tickets and requests assigned to you' }}</p>
        </div>
        <button *ngIf="mainTab() !== 'audit'" class="btn-primary" (click)="showCreateModal = true">
          <i class="bx bx-plus"></i> {{ mainTab() === 'support_ticket' ? 'New Ticket' : 'New Request' }}
        </button>
      </div>

      <!-- Stats -->
      <div class="stats-grid">
        <div class="stat-card">
          <i class="bx bx-folder-open"></i>
          <div>
            <span class="value">{{ stats().open }}</span>
            <span class="label">Open</span>
          </div>
        </div>
        <div class="stat-card">
          <i class="bx bx-loader-circle"></i>
          <div>
            <span class="value">{{ stats().inProgress }}</span>
            <span class="label">In Progress</span>
          </div>
        </div>
        <div class="stat-card">
          <i class="bx bx-check-circle"></i>
          <div>
            <span class="value">{{ stats().resolved }}</span>
            <span class="label">Resolved</span>
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="tabs-bar">
        <button class="tab-btn" [class.active]="activeTab === 'live'" (click)="activeTab = 'live'; onSubTabChange()">
          <i class="bx bx-check-circle"></i> Live <span class="tab-count">{{ liveTickets().length }}</span>
        </button>
        <button class="tab-btn" [class.active]="activeTab === 'archived'" (click)="activeTab = 'archived'; onSubTabChange()">
          <i class="bx bx-archive"></i> Archived <span class="tab-count">{{ archivedTickets().length }}</span>
        </button>
      </div>

      <!-- Sent / Received sub-tabs (Requests only) -->
      <div *ngIf="mainTab() === 'request'" class="sub-tabs-bar">
        <button class="sub-tab" [class.active]="directionTab() === 'all'" (click)="switchDirection('all')">
          <i class="bx bx-collection"></i> All <span class="sub-tab-count">{{ directionCounts().all }}</span>
        </button>
        <button class="sub-tab" [class.active]="directionTab() === 'sent'" (click)="switchDirection('sent')">
          <i class="bx bx-send"></i> Sent <span class="sub-tab-count">{{ directionCounts().sent }}</span>
        </button>
        <button class="sub-tab" [class.active]="directionTab() === 'received'" (click)="switchDirection('received')">
          <i class="bx bx-inbox"></i> Received <span class="sub-tab-count">{{ directionCounts().received }}</span>
        </button>
      </div>

      <!-- Filters -->
      <div class="filters-bar">
        <select [(ngModel)]="statusFilter" (ngModelChange)="loadTickets()" class="filter-select">
          <option value="">All Status</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="waiting">Waiting</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <select [(ngModel)]="priorityFilter" (ngModelChange)="loadTickets()" class="filter-select">
          <option value="">All Priority</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
          <option value="critical">Critical</option>
        </select>
      </div>

      <!-- Tickets List -->
      <div class="tickets-grid">
        <div *ngFor="let ticket of displayedTickets()" class="ticket-card" [class.unread]="isUnread(ticket)" [class.sent-pending]="isSentPending(ticket)" [class.sent-started]="isSentStarted(ticket)" (click)="viewTicket(ticket)">
          <div class="ticket-header">
            <span class="unread-flag" *ngIf="isUnread(ticket)" title="Unopened"><i class="bx bxs-flag-alt"></i></span>
            <span *ngIf="mainTab() === 'audit'" class="type-badge" [class.type-request]="ticket.type === 'request'" [class.type-ticket]="ticket.type === 'support_ticket'">
              <i class="bx" [class.bx-task]="ticket.type === 'request'" [class.bx-support]="ticket.type === 'support_ticket'"></i>
              {{ ticket.type === 'request' ? 'Request' : 'Ticket' }}
            </span>
            <span class="ticket-number">{{ ticket.ticketNumber }}</span>
            <span class="priority-badge" [class]="ticket.priority">{{ ticket.priority }}</span>
          </div>
          <h3>{{ ticket.title }}</h3>
          <p class="ticket-desc">{{ ticket.description | slice:0:150 }}...</p>
          <div class="ticket-meta">
            <span class="category-badge">{{ ticket.category }}</span>
            <span class="status-badge" [class]="ticket.status">{{ ticket.status }}</span>
            <span class="ticket-date">{{ ticket.createdAt | date:'short' }}</span>
            <span *ngIf="ticket.dueDate" class="due-date-badge" [class.overdue]="isOverdue(ticket.dueDate)">
              <i class="bx bx-calendar"></i> Due: {{ ticket.dueDate | date:'shortDate' }}
            </span>
          </div>
          <div class="ticket-footer">
            <span class="reporter">{{ mainTab() === 'request' || (mainTab() === 'audit' && ticket.type === 'request') ? 'From' : 'Reported by' }}: {{ ticket.reportedBy?.name }}</span>
            <span class="assigned" *ngIf="ticket.assignedTo">
              <i class="bx bx-user-circle"></i> {{ mainTab() === 'request' || (mainTab() === 'audit' && ticket.type === 'request') ? 'To' : 'Assigned to' }}: {{ ticket.assignedTo.name }}
            </span>
          </div>
          <div class="ticket-actions" (click)="$event.stopPropagation()">
            <button *ngIf="activeTab === 'live' && (ticket.status === 'resolved' || ticket.status === 'closed')" class="btn-archive" (click)="archiveTicket(ticket)" title="Archive">
              <i class="bx bx-archive-in"></i> Archive
            </button>
            <button *ngIf="activeTab === 'archived'" class="btn-restore" (click)="restoreTicket(ticket)" title="Restore">
              <i class="bx bx-revision"></i> Restore
            </button>
          </div>
        </div>

        <div *ngIf="loading()" class="loading">
          <i class="bx bx-loader-alt bx-spin"></i> Loading tickets...
        </div>

        <div *ngIf="!loading() && tickets().length === 0" class="empty-state">
          No tickets found. Create your first ticket!
        </div>
      </div>

      <!-- Create Modal -->
      <div *ngIf="showCreateModal" class="modal-overlay" (click)="showCreateModal = false">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <h2>{{ mainTab() === 'support_ticket' ? 'Create Support Ticket' : 'Create Request' }}</h2>
          <div class="form-grid">
            <input type="text" [(ngModel)]="newTicket.title" placeholder="Title *" required class="form-input">
            <textarea [(ngModel)]="newTicket.description" placeholder="Description *" rows="4" required class="form-textarea"></textarea>
            <!-- Support Ticket categories -->
            <select *ngIf="mainTab() === 'support_ticket'" [(ngModel)]="newTicket.category" class="form-select">
              <option value="general">General</option>
              <option value="technical">Technical</option>
              <option value="billing">Billing</option>
              <option value="bug">Bug Report</option>
              <option value="feature_request">Feature Request</option>
            </select>
            <!-- Request categories -->
            <select *ngIf="mainTab() === 'request'" [(ngModel)]="newTicket.category" class="form-select">
              <option value="general">General</option>
              <option value="it">IT</option>
              <option value="access">Access</option>
              <option value="equipment">Equipment</option>
              <option value="supplies">Supplies</option>
              <option value="other">Other</option>
            </select>
            <select [(ngModel)]="newTicket.priority" class="form-select">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <!-- Recipient for Requests -->
            <div *ngIf="mainTab() === 'request'" class="form-group">
              <label class="form-label">Recipient</label>
              <div class="recipient-picker">
                <div *ngIf="!newTicket.assignedToId" class="recipient-search-wrap">
                  <input type="text" [(ngModel)]="recipientSearch" (ngModelChange)="filterRecipients()" placeholder="Search for a person..." class="form-input recipient-input">
                  <div *ngIf="recipientSearch && filteredUsers().length > 0" class="recipient-dropdown">
                    <div *ngFor="let user of filteredUsers()" class="recipient-option" (click)="selectRecipient(user)">
                      <i class="bx bx-user"></i>
                      <div>
                        <span class="recipient-name">{{ user.name }}</span>
                        <span class="recipient-role" *ngIf="user.role">{{ user.role }}</span>
                      </div>
                    </div>
                  </div>
                  <div *ngIf="recipientSearch && filteredUsers().length === 0" class="recipient-dropdown">
                    <div class="recipient-empty">No users found</div>
                  </div>
                </div>
                <div *ngIf="newTicket.assignedToId" class="recipient-selected">
                  <i class="bx bx-user-circle"></i>
                  <span>{{ getSelectedRecipientName() }}</span>
                  <button class="recipient-clear" (click)="clearRecipient()"><i class="bx bx-x"></i></button>
                </div>
              </div>
            </div>
            <!-- Due date for Requests -->
            <div *ngIf="mainTab() === 'request'" class="form-group">
              <label class="form-label">Due Date</label>
              <input type="date" [(ngModel)]="newTicket.dueDate" class="form-input">
            </div>
          </div>
          <div class="modal-actions">
            <button class="btn-secondary" (click)="showCreateModal = false">Cancel</button>
            <button class="btn-primary" (click)="createTicket()">{{ mainTab() === 'support_ticket' ? 'Create Ticket' : 'Create Request' }}</button>
          </div>
        </div>
      </div>

      <!-- Ticket Detail Modal -->
      <div *ngIf="selectedTicket()" class="modal-overlay" (click)="closeTicketDetail()">
        <div class="modal-content detail-modal" (click)="$event.stopPropagation()">
          <div class="detail-header">
            <div>
              <h2>{{ selectedTicket()!.title }}</h2>
              <span class="ticket-number-large">{{ selectedTicket()!.ticketNumber }}</span>
            </div>
            <button class="close-btn" (click)="closeTicketDetail()">
              <i class="bx bx-x"></i>
            </button>
          </div>

          <div class="detail-body">
            <!-- Ticket Info -->
            <div class="info-section">
              <div class="info-row">
                <span class="priority-badge" [class]="selectedTicket()!.priority">{{ selectedTicket()!.priority }}</span>
                <span class="status-badge" [class]="selectedTicket()!.status">{{ selectedTicket()!.status }}</span>
                <span class="category-badge">{{ selectedTicket()!.category }}</span>
              </div>
              
              <div class="info-grid">
                <div class="info-item">
                  <label>{{ mainTab() === 'request' ? 'From:' : 'Reported By:' }}</label>
                  <span>{{ selectedTicket()!.reportedBy?.name }}</span>
                </div>
                <div class="info-item">
                  <label>Created:</label>
                  <span>{{ selectedTicket()!.createdAt | date:'medium' }}</span>
                </div>
                <div class="info-item">
                  <label>{{ mainTab() === 'request' ? 'To:' : 'Assigned To:' }}</label>
                  <span>{{ selectedTicket()!.assignedTo?.name || 'Unassigned' }}</span>
                </div>
                <div class="info-item">
                  <label>Last Updated:</label>
                  <span>{{ selectedTicket()!.updatedAt | date:'medium' }}</span>
                </div>
                <div class="info-item" *ngIf="selectedTicket()!.dueDate">
                  <label>Due Date:</label>
                  <span [class.overdue-text]="isOverdue(selectedTicket()!.dueDate)">{{ selectedTicket()!.dueDate | date:'mediumDate' }}</span>
                </div>
              </div>
            </div>

            <!-- Description -->
            <div class="section">
              <h3><i class="bx bx-file-blank"></i> Description</h3>
              <p class="description">{{ selectedTicket()!.description }}</p>
            </div>

            <!-- Activity Log -->
            <div class="section">
              <h3><i class="bx bx-history"></i> Activity Log</h3>
              <div class="activity-timeline">
                <div class="activity-item created">
                  <div class="activity-icon"><i class="bx bx-plus-circle"></i></div>
                  <div class="activity-content">
                    <strong>Ticket Created</strong>
                    <span class="activity-user">by {{ selectedTicket()!.reportedBy?.name }}</span>
                    <span class="activity-time">{{ selectedTicket()!.createdAt | date:'short' }}</span>
                  </div>
                </div>
                
                <div *ngFor="let comment of ticketComments()" class="activity-item comment">
                  <div class="activity-icon"><i class="bx bx-message-dots"></i></div>
                  <div class="activity-content">
                    <strong>Comment Added</strong>
                    <p class="comment-text">{{ comment.comment }}</p>
                    <span class="activity-user">by {{ comment.user?.name }}</span>
                    <span class="activity-time">{{ comment.createdAt | date:'short' }}</span>
                  </div>
                </div>

                <div *ngIf="selectedTicket()!.resolvedAt" class="activity-item resolved">
                  <div class="activity-icon"><i class="bx bx-check-circle"></i></div>
                  <div class="activity-content">
                    <strong>Ticket Resolved</strong>
                    <span class="activity-time">{{ selectedTicket()!.resolvedAt | date:'short' }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Comments Section -->
            <div class="section">
              <h3><i class="bx bx-comment-dots"></i> Add Comment</h3>
              <div class="comment-form">
                <textarea [(ngModel)]="newComment" placeholder="Add a comment or update..." rows="3" class="comment-input"></textarea>
                <button class="btn-comment" (click)="addComment()">
                  <i class="bx bx-send"></i> Post Comment
                </button>
              </div>
            </div>
          </div>

          <div class="detail-footer">
            <!-- Sent request actions (you created this request) -->
            <div class="action-buttons" *ngIf="isSentRequest(); else receivedOrTicketActions">
              <div class="sent-status-line">
                <span class="status-label">Status:</span>
                <span class="status-badge" [class]="selectedTicket()!.status">{{ selectedTicket()!.status | titlecase }}</span>
                <span *ngIf="selectedTicket()!.assignedTo" class="assigned-label">
                  <i class="bx bx-user-circle"></i> Waiting on {{ selectedTicket()!.assignedTo.name }}
                </span>
              </div>
              <div class="sent-actions">
                <button *ngIf="selectedTicket()!.status === 'open' || selectedTicket()!.status === 'in_progress'" class="btn-action nudge" (click)="followUpRequest()">
                  <i class="bx bx-bell"></i> Follow Up
                </button>
                <button *ngIf="selectedTicket()!.status === 'resolved'" class="btn-action resolve" (click)="updateTicketStatus('closed')">
                  <i class="bx bx-check-double"></i> Confirm &amp; Close
                </button>
                <button *ngIf="selectedTicket()!.status === 'resolved'" class="btn-action reopen" (click)="updateTicketStatus('open')">
                  <i class="bx bx-revision"></i> Not Resolved
                </button>
                <button *ngIf="selectedTicket()!.status === 'closed' || selectedTicket()!.status === 'cancelled'" class="btn-action reopen" (click)="updateTicketStatus('open')">
                  <i class="bx bx-refresh"></i> Reopen
                </button>
                <button *ngIf="selectedTicket()!.status !== 'cancelled' && selectedTicket()!.status !== 'closed'" class="btn-action cancel" (click)="updateTicketStatus('cancelled')">
                  <i class="bx bx-x"></i> Cancel Request
                </button>
                <button class="btn-action archive" (click)="archiveTicket(selectedTicket()!); closeTicketDetail()">
                  <i class="bx bx-archive-in"></i> Archive
                </button>
              </div>
            </div>
            <!-- Received request / Support ticket actions -->
            <ng-template #receivedOrTicketActions>
              <div class="action-buttons">
                <button *ngIf="selectedTicket()!.status !== 'in_progress'" class="btn-action progress" (click)="updateTicketStatus('in_progress')">
                  <i class="bx bx-loader-circle"></i> Start Progress
                </button>
                <button *ngIf="selectedTicket()!.status !== 'resolved'" class="btn-action resolve" (click)="updateTicketStatus('resolved')">
                  <i class="bx bx-check-circle"></i> Resolve
                </button>
                <button *ngIf="selectedTicket()!.status !== 'closed'" class="btn-action close" (click)="updateTicketStatus('closed')">
                  <i class="bx bx-x-circle"></i> Close
                </button>
                <button class="btn-action reopen" (click)="updateTicketStatus('open')">
                  <i class="bx bx-refresh"></i> Reopen
                </button>
                <!-- Forward to another person (requests only) -->
                <div *ngIf="mainTab() === 'request'" class="forward-wrap">
                  <button class="btn-action forward" (click)="showForwardPicker = !showForwardPicker">
                    <i class="bx bx-share"></i> Forward
                  </button>
                  <div *ngIf="showForwardPicker" class="forward-dropdown">
                    <input type="text" [(ngModel)]="forwardSearch" (ngModelChange)="filterForwardUsers()" placeholder="Search person..." class="forward-search-input" (click)="$event.stopPropagation()">
                    <div class="forward-list">
                      <div *ngFor="let user of forwardFilteredUsers()" class="forward-option" (click)="forwardRequest(user)">
                        <i class="bx bx-user"></i>
                        <span>{{ user.name }}</span>
                      </div>
                      <div *ngIf="forwardSearch && forwardFilteredUsers().length === 0" class="forward-empty">No users found</div>
                    </div>
                  </div>
                </div>
                <button *ngIf="selectedTicket()!.status === 'resolved' || selectedTicket()!.status === 'closed'" class="btn-action archive" (click)="archiveTicket(selectedTicket()!); closeTicketDetail()">
                  <i class="bx bx-archive-in"></i> Archive
                </button>
              </div>
            </ng-template>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .tickets-page { padding: 24px; }
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    .page-header h1 { color: #00f2fe; font-size: 2rem; margin: 0 0 8px 0; display: flex; align-items: center; gap: 12px; }
    .btn-primary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .stat-card { background: rgba(26, 26, 46, 0.6); backdrop-filter: blur(12px); border: 1px solid rgba(0, 242, 254, 0.3); border-radius: 12px; padding: 20px; display: flex; align-items: center; gap: 16px; }
    .stat-card i { font-size: 2.5rem; color: #00f2fe; }
    .stat-card .value { display: block; font-size: 1.8rem; font-weight: 700; color: #00f2fe; }
    .stat-card .label { display: block; font-size: 0.85rem; color: #9ca3af; margin-top: 4px; }
    .filters-bar { display: flex; gap: 12px; margin-bottom: 24px; }
    .filter-select { background: rgba(16, 18, 27, 0.8); border: 1px solid rgba(0, 242, 254, 0.3); border-radius: 8px; padding: 10px 16px; color: #e0e0e0; }
    .tickets-grid { display: grid; gap: 20px; }
    .ticket-card { background: rgba(26, 26, 46, 0.6); backdrop-filter: blur(12px); border: 1px solid rgba(0, 242, 254, 0.3); border-radius: 16px; padding: 24px; cursor: pointer; transition: all 0.3s ease; }
    .ticket-card:hover { transform: translateY(-4px); box-shadow: 0 12px 24px rgba(0, 242, 254, 0.2); }
    .ticket-card.unread { border-left: 3px solid #ef4444; }
    .type-badge { padding: 3px 10px; border-radius: 12px; font-size: 0.7rem; font-weight: 600; display: flex; align-items: center; gap: 4px; text-transform: uppercase; }
    .type-badge.type-request { background: rgba(168, 85, 247, 0.2); color: #a855f7; }
    .type-badge.type-ticket { background: rgba(59, 130, 246, 0.2); color: #3b82f6; }
    .ticket-card.sent-pending { border-left: 3px solid #ef4444; background: rgba(239, 68, 68, 0.06); }
    .ticket-card.sent-pending:hover { box-shadow: 0 12px 24px rgba(239, 68, 68, 0.15); }
    .ticket-card.sent-started { border-left: 3px solid #22c55e; background: rgba(34, 197, 94, 0.06); }
    .ticket-card.sent-started:hover { box-shadow: 0 12px 24px rgba(34, 197, 94, 0.15); }
    .unread-flag { color: #ef4444; font-size: 1.1rem; display: flex; align-items: center; animation: flag-pulse 2s ease-in-out infinite; }
    @keyframes flag-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    .ticket-header { display: flex; justify-content: space-between; margin-bottom: 12px; }
    .ticket-number { color: #00f2fe; font-weight: 600; }
    .priority-badge { padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
    .priority-badge.low { background: rgba(156, 163, 175, 0.2); color: #9ca3af; }
    .priority-badge.medium { background: rgba(59, 130, 246, 0.2); color: #3b82f6; }
    .priority-badge.high { background: rgba(251, 191, 36, 0.2); color: #fbbf24; }
    .priority-badge.urgent { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
    .priority-badge.critical { background: rgba(220, 38, 38, 0.3); color: #dc2626; animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
    .ticket-card h3 { color: #00f2fe; margin: 0 0 12px 0; }
    .ticket-desc { color: #9ca3af; font-size: 0.9rem; margin-bottom: 16px; }
    .ticket-meta { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; }
    .category-badge { padding: 4px 12px; border-radius: 20px; background: rgba(102, 126, 234, 0.2); color: #667eea; font-size: 0.75rem; }
    .status-badge { padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
    .status-badge.open { background: rgba(59, 130, 246, 0.2); color: #3b82f6; }
    .status-badge.in_progress { background: rgba(251, 191, 36, 0.2); color: #fbbf24; }
    .status-badge.resolved { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
    .status-badge.closed { background: rgba(156, 163, 175, 0.2); color: #9ca3af; }
    .ticket-date { color: #6b7280; font-size: 0.85rem; }
    .ticket-footer { display: flex; justify-content: space-between; color: #9ca3af; font-size: 0.85rem; }
    .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.8); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .modal-content { background: rgba(26, 26, 46, 0.98); border: 1px solid rgba(0, 242, 254, 0.3); border-radius: 16px; padding: 32px; width: 90%; max-width: 600px; }
    .modal-content h2 { color: #00f2fe; margin: 0 0 24px 0; }
    .form-grid { display: grid; gap: 16px; margin-bottom: 24px; }
    .form-input, .form-select, .form-textarea { background: rgba(16, 18, 27, 0.8); border: 1px solid rgba(0, 242, 254, 0.3); border-radius: 8px; padding: 12px; color: #e0e0e0; width: 100%; }
    .modal-actions { display: flex; gap: 12px; justify-content: flex-end; }
    .btn-secondary { background: rgba(156, 163, 175, 0.2); color: #9ca3af; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; }
    .loading, .empty-state { text-align: center; padding: 60px; color: #9ca3af; }
    .detail-modal { max-width: 900px; max-height: 90vh; overflow: hidden; display: flex; flex-direction: column; }
    .detail-header { display: flex; justify-content: space-between; align-items: start; padding: 24px; border-bottom: 1px solid rgba(0, 242, 254, 0.2); }
    .detail-header h2 { color: #00f2fe; margin: 0 0 8px 0; }
    .ticket-number-large { color: #9ca3af; font-size: 0.9rem; }
    .close-btn { background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; }
    .detail-body { flex: 1; overflow-y: auto; padding: 24px; }
    .info-section { margin-bottom: 24px; }
    .info-row { display: flex; gap: 12px; margin-bottom: 16px; }
    .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
    .info-item { display: flex; flex-direction: column; gap: 4px; }
    .info-item label { color: #9ca3af; font-size: 0.85rem; }
    .info-item span { color: #e0e0e0; }
    .section { background: rgba(16, 18, 27, 0.6); border: 1px solid rgba(0, 242, 254, 0.2); border-radius: 12px; padding: 20px; margin-bottom: 20px; }
    .section h3 { color: #00f2fe; margin: 0 0 16px 0; font-size: 1.1rem; display: flex; align-items: center; gap: 8px; }
    .description { color: #e0e0e0; line-height: 1.6; white-space: pre-wrap; }
    .activity-timeline { display: flex; flex-direction: column; gap: 16px; }
    .activity-item { display: flex; gap: 16px; }
    .activity-icon { width: 36px; height: 36px; border-radius: 50%; background: rgba(0, 242, 254, 0.2); display: flex; align-items: center; justify-content: center; color: #00f2fe; flex-shrink: 0; }
    .activity-content { flex: 1; }
    .activity-content strong { color: #00f2fe; display: block; margin-bottom: 4px; }
    .activity-user { color: #9ca3af; font-size: 0.85rem; margin-right: 12px; }
    .activity-time { color: #6b7280; font-size: 0.85rem; }
    .comment-text { color: #e0e0e0; margin: 8px 0; padding: 12px; background: rgba(0, 0, 0, 0.3); border-radius: 8px; }
    .activity-item.resolved .activity-icon { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
    .comment-form { display: flex; flex-direction: column; gap: 12px; }
    .comment-input { background: rgba(16, 18, 27, 0.8); border: 1px solid rgba(0, 242, 254, 0.3); border-radius: 8px; padding: 12px; color: #e0e0e0; resize: vertical; }
    .btn-comment { align-self: flex-end; background: rgba(34, 197, 94, 0.2); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.3); padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 8px; }
    .btn-comment:hover { background: rgba(34, 197, 94, 0.3); }
    .detail-footer { padding: 20px 24px; border-top: 1px solid rgba(0, 242, 254, 0.2); background: rgba(16, 18, 27, 0.4); }
    .action-buttons { display: flex; gap: 12px; flex-wrap: wrap; }
    .btn-action { padding: 10px 20px; border-radius: 8px; border: none; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: all 0.2s ease; }
    .btn-action.progress { background: rgba(251, 191, 36, 0.2); color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.3); }
    .btn-action.progress:hover { background: rgba(251, 191, 36, 0.3); }
    .btn-action.resolve { background: rgba(34, 197, 94, 0.2); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.3); }
    .btn-action.resolve:hover { background: rgba(34, 197, 94, 0.3); }
    .btn-action.close { background: rgba(156, 163, 175, 0.2); color: #9ca3af; border: 1px solid rgba(156, 163, 175, 0.3); }
    .btn-action.close:hover { background: rgba(156, 163, 175, 0.3); }
    .btn-action.reopen { background: rgba(59, 130, 246, 0.2); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.3); }
    .btn-action.reopen:hover { background: rgba(59, 130, 246, 0.3); }
    .btn-action.archive { background: rgba(245, 158, 11, 0.2); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); }
    .btn-action.archive:hover { background: rgba(245, 158, 11, 0.3); }
    .tabs-bar { display: flex; gap: 4px; margin-bottom: 20px; border-bottom: 1px solid rgba(0, 242, 254, 0.15); padding-bottom: 0; }
    .tab-btn { padding: 10px 18px; border: none; background: none; color: #9ca3af; cursor: pointer; font-size: 0.88rem; font-weight: 600; display: flex; align-items: center; gap: 6px; border-bottom: 2px solid transparent; transition: all 0.2s; }
    .tab-btn.active { color: #00f2fe; border-bottom-color: #00f2fe; }
    .tab-btn:hover { color: #e0e0e0; }
    .tab-count { background: rgba(255,255,255,0.08); padding: 1px 7px; border-radius: 10px; font-size: 0.75rem; }
    .tab-btn.active .tab-count { background: rgba(0, 242, 254, 0.15); color: #00f2fe; }
    .ticket-actions { margin-top: 12px; display: flex; gap: 8px; }
    .btn-archive { background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); padding: 6px 14px; border-radius: 8px; cursor: pointer; font-size: 0.8rem; font-weight: 600; display: flex; align-items: center; gap: 5px; transition: all 0.2s; }
    .btn-archive:hover { background: rgba(245, 158, 11, 0.25); }
    .btn-restore { background: rgba(34, 197, 94, 0.15); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.3); padding: 6px 14px; border-radius: 8px; cursor: pointer; font-size: 0.8rem; font-weight: 600; display: flex; align-items: center; gap: 5px; transition: all 0.2s; }
    .btn-restore:hover { background: rgba(34, 197, 94, 0.25); }
    .main-tabs { display: flex; gap: 0; margin-bottom: 24px; background: rgba(16, 18, 27, 0.6); border-radius: 12px; padding: 4px; border: 1px solid rgba(0, 242, 254, 0.15); width: fit-content; }
    .main-tab { padding: 12px 28px; border: none; background: transparent; color: #9ca3af; cursor: pointer; font-size: 0.95rem; font-weight: 600; display: flex; align-items: center; gap: 8px; border-radius: 8px; transition: all 0.2s ease; }
    .main-tab.active { background: linear-gradient(135deg, rgba(0, 242, 254, 0.15) 0%, rgba(102, 126, 234, 0.15) 100%); color: #00f2fe; box-shadow: 0 2px 8px rgba(0, 242, 254, 0.15); }
    .main-tab:hover:not(.active) { color: #e0e0e0; background: rgba(255, 255, 255, 0.04); }
    .main-tab i { font-size: 1.2rem; }
    .due-date-badge { padding: 4px 10px; border-radius: 20px; background: rgba(59, 130, 246, 0.15); color: #3b82f6; font-size: 0.75rem; display: flex; align-items: center; gap: 4px; }
    .due-date-badge.overdue { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
    .overdue-text { color: #ef4444 !important; }
    .form-group { display: flex; flex-direction: column; gap: 6px; }
    .form-label { color: #9ca3af; font-size: 0.85rem; font-weight: 500; }
    .recipient-picker { position: relative; }
    .recipient-search-wrap { position: relative; }
    .recipient-input { padding-right: 12px; }
    .recipient-dropdown { position: absolute; top: 100%; left: 0; right: 0; background: rgba(16, 18, 27, 0.98); border: 1px solid rgba(0, 242, 254, 0.3); border-radius: 8px; margin-top: 4px; max-height: 200px; overflow-y: auto; z-index: 10; }
    .recipient-option { display: flex; align-items: center; gap: 10px; padding: 10px 14px; cursor: pointer; transition: background 0.15s; }
    .recipient-option:hover { background: rgba(0, 242, 254, 0.1); }
    .recipient-option i { font-size: 1.3rem; color: #00f2fe; }
    .recipient-name { color: #e0e0e0; font-weight: 500; display: block; }
    .recipient-role { color: #6b7280; font-size: 0.75rem; text-transform: capitalize; }
    .recipient-empty { padding: 12px 14px; color: #6b7280; font-size: 0.85rem; }
    .recipient-selected { display: flex; align-items: center; gap: 10px; background: rgba(0, 242, 254, 0.1); border: 1px solid rgba(0, 242, 254, 0.3); border-radius: 8px; padding: 10px 14px; }
    .recipient-selected i { font-size: 1.4rem; color: #00f2fe; }
    .recipient-selected span { color: #e0e0e0; font-weight: 500; flex: 1; }
    .recipient-clear { background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
    .recipient-clear:hover { background: rgba(239, 68, 68, 0.3); }
    .sent-status-line { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
    .status-label { color: #9ca3af; font-size: 0.85rem; font-weight: 500; }
    .assigned-label { color: #9ca3af; font-size: 0.85rem; display: flex; align-items: center; gap: 4px; margin-left: 8px; }
    .assigned-label i { color: #00f2fe; }
    .sent-actions { display: flex; gap: 12px; flex-wrap: wrap; }
    .btn-action.nudge { background: rgba(99, 102, 241, 0.2); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.3); }
    .btn-action.nudge:hover { background: rgba(99, 102, 241, 0.3); }
    .btn-action.cancel { background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); }
    .btn-action.cancel:hover { background: rgba(239, 68, 68, 0.25); }
    .status-badge.cancelled { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
    .forward-wrap { position: relative; }
    .btn-action.forward { background: rgba(168, 85, 247, 0.2); color: #a855f7; border: 1px solid rgba(168, 85, 247, 0.3); }
    .btn-action.forward:hover { background: rgba(168, 85, 247, 0.3); }
    .forward-dropdown { position: absolute; bottom: 100%; left: 0; margin-bottom: 8px; background: rgba(16, 18, 27, 0.98); border: 1px solid rgba(168, 85, 247, 0.4); border-radius: 10px; width: 260px; z-index: 20; overflow: hidden; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5); }
    .forward-search-input { width: 100%; background: rgba(26, 26, 46, 0.8); border: none; border-bottom: 1px solid rgba(168, 85, 247, 0.2); padding: 10px 14px; color: #e0e0e0; font-size: 0.85rem; outline: none; }
    .forward-search-input::placeholder { color: #6b7280; }
    .forward-list { max-height: 180px; overflow-y: auto; }
    .forward-option { display: flex; align-items: center; gap: 8px; padding: 9px 14px; cursor: pointer; color: #e0e0e0; font-size: 0.85rem; transition: background 0.15s; }
    .forward-option:hover { background: rgba(168, 85, 247, 0.15); }
    .forward-option i { color: #a855f7; font-size: 1.1rem; }
    .forward-empty { padding: 12px 14px; color: #6b7280; font-size: 0.82rem; }
    .sub-tabs-bar { display: flex; gap: 6px; margin-bottom: 20px; }
    .sub-tab { padding: 7px 16px; border: 1px solid rgba(0, 242, 254, 0.15); background: rgba(16, 18, 27, 0.5); color: #9ca3af; cursor: pointer; font-size: 0.82rem; font-weight: 600; display: flex; align-items: center; gap: 6px; border-radius: 20px; transition: all 0.2s; }
    .sub-tab.active { background: rgba(0, 242, 254, 0.12); color: #00f2fe; border-color: rgba(0, 242, 254, 0.35); }
    .sub-tab:hover:not(.active) { color: #e0e0e0; border-color: rgba(255, 255, 255, 0.15); }
    .sub-tab-count { background: rgba(255,255,255,0.06); padding: 1px 7px; border-radius: 10px; font-size: 0.72rem; }
    .sub-tab.active .sub-tab-count { background: rgba(0, 242, 254, 0.15); color: #00f2fe; }
  `]
})
export class TicketsComponent implements OnInit {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private apiUrl = environment.apiUrl;

  mainTab = signal<'support_ticket' | 'request' | 'audit'>('support_ticket');
  directionTab = signal<'all' | 'sent' | 'received'>('all');
  tickets = signal<any[]>([]);
  loading = signal(true);
  showCreateModal = false;
  activeTab: 'live' | 'archived' = 'live';
  statusFilter = '';
  priorityFilter = '';

  orgUsers = signal<any[]>([]);
  filteredUsers = signal<any[]>([]);
  recipientSearch = '';

  liveTickets = signal<any[]>([]);
  archivedTickets = signal<any[]>([]);
  displayedTickets = signal<any[]>([]);

  directionCounts = signal<{ all: number; sent: number; received: number }>({ all: 0, sent: 0, received: 0 });

  stats = signal({
    total: 0,
    open: 0,
    inProgress: 0,
    resolved: 0,
    closed: 0
  });

  newTicket: any = {
    title: '',
    description: '',
    category: 'general',
    priority: 'medium',
    type: 'support_ticket',
    dueDate: null,
    assignedToId: null
  };

  switchMainTab(tab: 'support_ticket' | 'request' | 'audit') {
    this.mainTab.set(tab);
    this.activeTab = 'live';
    this.directionTab.set('all');
    this.statusFilter = '';
    this.priorityFilter = '';
    if (tab !== 'audit') {
      this.newTicket.type = tab;
    }
    this.newTicket.category = 'general';
    this.newTicket.dueDate = null;
    this.newTicket.assignedToId = null;
    this.recipientSearch = '';
    if (tab === 'audit') {
      this.loadAuditTickets();
    } else {
      this.loadTickets();
      this.loadStats();
    }
  }

  switchDirection(dir: 'all' | 'sent' | 'received') {
    this.directionTab.set(dir);
    this.applyFilters();
  }

  onSubTabChange() {
    if (this.mainTab() === 'audit') {
      this.displayedTickets.set(this.activeTab === 'archived' ? this.archivedTickets() : this.liveTickets());
    } else {
      this.applyFilters();
    }
  }

  isOverdue(dueDate: string): boolean {
    return new Date(dueDate) < new Date();
  }

  ngOnInit() {
    this.loadTickets();
    this.loadStats();
    this.loadUsers();
  }

  async loadUsers() {
    try {
      const res: any = await this.http.get(`${this.apiUrl}/api/v1/users?pageSize=500`).toPromise();
      this.orgUsers.set(res?.data || []);
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  }

  filterRecipients() {
    const search = this.recipientSearch.toLowerCase().trim();
    if (!search) {
      this.filteredUsers.set([]);
      return;
    }
    this.filteredUsers.set(
      this.orgUsers().filter((u: any) =>
        u.name?.toLowerCase().startsWith(search) ||
        u.alias?.toLowerCase().startsWith(search) ||
        u.name?.toLowerCase().includes(search) ||
        u.alias?.toLowerCase().includes(search) ||
        u.email?.toLowerCase().includes(search)
      ).sort((a: any, b: any) => {
        const aStarts = a.name?.toLowerCase().startsWith(search) || a.alias?.toLowerCase().startsWith(search);
        const bStarts = b.name?.toLowerCase().startsWith(search) || b.alias?.toLowerCase().startsWith(search);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return (a.name || '').localeCompare(b.name || '');
      }).slice(0, 10)
    );
  }

  selectRecipient(user: any) {
    this.newTicket.assignedToId = user.id;
    this.recipientSearch = '';
    this.filteredUsers.set([]);
  }

  clearRecipient() {
    this.newTicket.assignedToId = null;
    this.recipientSearch = '';
  }

  getSelectedRecipientName(): string {
    const user = this.orgUsers().find((u: any) => u.id === this.newTicket.assignedToId);
    return user?.name || 'Unknown';
  }

  private getRecipientNameById(id: number): string {
    const user = this.orgUsers().find((u: any) => u.id === id);
    return user?.name || '';
  }

  private ticketPayload(ticket: any, overrides: any = {}): any {
    return {
      title: ticket.title,
      description: ticket.description,
      type: ticket.type || this.mainTab(),
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      assignedToId: ticket.assignedToId ?? null,
      dueDate: ticket.dueDate ?? null,
      ...overrides
    };
  }

  isSentRequest(): boolean {
    const ticket = this.selectedTicket();
    if (!ticket || this.mainTab() !== 'request') return false;
    const myId = this.authService.currentUser()?.id;
    return !!myId && ticket.reportedById === myId && ticket.assignedToId !== myId;
  }

  showForwardPicker = false;
  forwardSearch = '';
  forwardFilteredUsers = signal<any[]>([]);

  filterForwardUsers() {
    const search = this.forwardSearch.toLowerCase().trim();
    if (!search) {
      this.forwardFilteredUsers.set([]);
      return;
    }
    const myId = this.authService.currentUser()?.id;
    const currentAssignee = this.selectedTicket()?.assignedToId;
    this.forwardFilteredUsers.set(
      this.orgUsers().filter((u: any) =>
        u.id !== myId && u.id !== currentAssignee &&
        (u.name?.toLowerCase().includes(search) || u.email?.toLowerCase().includes(search))
      ).slice(0, 8)
    );
  }

  async forwardRequest(user: any) {
    const ticket = this.selectedTicket();
    if (!ticket) return;
    try {
      // Post comment BEFORE reassigning -- once assignee changes, current user loses comment permission
      await this.http.post(`${this.apiUrl}/api/v1/tickets/${ticket.id}/comments`, {
        comment: `Forwarded this request to ${user.name}.`,
        isInternal: false
      }).toPromise();

      await this.http.put(`${this.apiUrl}/api/v1/tickets/${ticket.id}`,
        this.ticketPayload(ticket, { assignedToId: user.id })
      ).toPromise();

      this.showForwardPicker = false;
      this.forwardSearch = '';
      this.forwardFilteredUsers.set([]);
      this.toast.champagne(`Request forwarded to ${user.name}`);
      this.closeTicketDetail();
      this.loadTickets();
    } catch (err) {
      console.error('Failed to forward request:', err);
      this.toast.error('Failed to forward request');
    }
  }

  private checkProductOwnerRequests(tickets: any[]) {
    const myId = this.authService.currentUser()?.id;
    if (!myId) return;

    const poRoles = ['product_owner', 'superadmin'];
    const pendingPoRequests = tickets.filter((t: any) =>
      t.type === 'request' &&
      t.assignedToId === myId &&
      t.status === 'open' &&
      t.reportedBy?.role && poRoles.includes(t.reportedBy.role.toLowerCase())
    );

    for (const req of pendingPoRequests) {
      const senderName = req.reportedBy?.name || 'Product Owner';
      this.toast.lockedChampagne(
        `"${req.title}" — tap Start Progress to acknowledge`,
        `New request from ${senderName}`,
        req.id
      );
    }
  }

  async followUpRequest() {
    const ticket = this.selectedTicket();
    if (!ticket) return;
    const recipientName = ticket.assignedTo?.name || 'the recipient';
    this.newComment = `Following up on this request. ${recipientName}, could you provide an update?`;
    await this.addComment();
    this.toast.champagne(`Follow-up sent to ${recipientName}`);
  }

  async loadTickets() {
    try {
      this.loading.set(true);
      const params = new URLSearchParams({
        type: this.mainTab(),
        ...(this.statusFilter && { status: this.statusFilter }),
        ...(this.priorityFilter && { priority: this.priorityFilter })
      });
      const response: any = await this.http.get(`${this.apiUrl}/api/v1/tickets?${params}`).toPromise();
      const all = response?.data || [];
      this.tickets.set(all);
      this.liveTickets.set(all.filter((t: any) => t.status !== 'archived'));
      this.archivedTickets.set(all.filter((t: any) => t.status === 'archived'));
      this.computeDirectionCounts();
      this.applyFilters();
      this.checkProductOwnerRequests(all);
      this.loading.set(false);
    } catch (err) {
      console.error('Failed to load tickets:', err);
      this.loading.set(false);
    }
  }

  async loadAuditTickets() {
    try {
      this.loading.set(true);
      const myId = this.authService.currentUser()?.id;
      const myDept = this.authService.currentUser()?.department;

      const params = new URLSearchParams({
        ...(this.statusFilter && { status: this.statusFilter }),
        ...(this.priorityFilter && { priority: this.priorityFilter })
      });

      const response: any = await this.http.get(`${this.apiUrl}/api/v1/tickets?${params}`).toPromise();
      const allOrg = response?.data || [];

      const filtered = allOrg.filter((t: any) => {
        if (t.type === 'request') {
          return t.assignedToId === myId;
        } else {
          if (myDept) {
            return t.reportedBy?.department === myDept || t.assignedTo?.department === myDept;
          }
          return true;
        }
      });

      this.tickets.set(filtered);
      this.liveTickets.set(filtered.filter((t: any) => t.status !== 'archived'));
      this.archivedTickets.set(filtered.filter((t: any) => t.status === 'archived'));
      this.displayedTickets.set(this.activeTab === 'archived' ? this.archivedTickets() : this.liveTickets());

      this.stats.set({
        total: filtered.length,
        open: filtered.filter((t: any) => t.status === 'open').length,
        inProgress: filtered.filter((t: any) => t.status === 'in_progress').length,
        resolved: filtered.filter((t: any) => t.status === 'resolved').length,
        closed: filtered.filter((t: any) => t.status === 'closed').length
      });

      this.loading.set(false);
    } catch (err) {
      console.error('Failed to load audit tickets:', err);
      this.loading.set(false);
    }
  }

  private computeDirectionCounts() {
    const myId = this.authService.currentUser()?.id;
    const pool = this.activeTab === 'archived' ? this.archivedTickets() : this.liveTickets();
    this.directionCounts.set({
      all: pool.length,
      sent: myId ? pool.filter((t: any) => t.reportedById === myId).length : pool.length,
      received: myId ? pool.filter((t: any) => t.assignedToId === myId).length : 0
    });
  }

  applyFilters() {
    const pool = this.activeTab === 'archived' ? this.archivedTickets() : this.liveTickets();
    const myId = this.authService.currentUser()?.id;
    const dir = this.directionTab();

    if (this.mainTab() === 'request' && dir !== 'all' && myId) {
      if (dir === 'sent') {
        this.displayedTickets.set(pool.filter((t: any) => t.reportedById === myId));
      } else {
        this.displayedTickets.set(pool.filter((t: any) => t.assignedToId === myId));
      }
    } else {
      this.displayedTickets.set(pool);
    }
    this.computeDirectionCounts();
  }

  async loadStats() {
    try {
      const stats: any = await this.http.get(`${this.apiUrl}/api/v1/tickets/stats`).toPromise();
      this.stats.set(stats || this.stats());
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }

  async createTicket() {
    // Validate required fields
    if (!this.newTicket.title?.trim()) {
      this.toast.warning('Please enter a title');
      return;
    }
    if (!this.newTicket.description?.trim()) {
      this.toast.warning('Please enter a description');
      return;
    }

    try {
      const isRequest = this.mainTab() === 'request';
      const payload: any = {
        title: this.newTicket.title,
        description: this.newTicket.description,
        category: this.newTicket.category,
        priority: this.newTicket.priority,
        type: this.mainTab()
      };
      if (isRequest) {
        if (this.newTicket.dueDate) payload.dueDate = this.newTicket.dueDate;
        if (this.newTicket.assignedToId) payload.assignedToId = this.newTicket.assignedToId;
      }
      await this.http.post(`${this.apiUrl}/api/v1/tickets`, payload).toPromise();
      this.showCreateModal = false;
      this.newTicket = { title: '', description: '', category: 'general', priority: 'medium', type: this.mainTab(), dueDate: null, assignedToId: null };
      this.recipientSearch = '';

      const recipientName = isRequest && payload.assignedToId ? this.getRecipientNameById(payload.assignedToId) : '';
      const toastMsg = isRequest
        ? `Request "${payload.title}" sent${recipientName ? ' to ' + recipientName : ''}`
        : `Ticket "${payload.title}" created`;
      this.toast.champagne(toastMsg);

      this.loadTickets();
      this.loadStats();
    } catch (err: any) {
      console.error('Failed to create ticket:', err);
      const errorMsg = err?.error?.errors 
        ? Object.values(err.error.errors).flat().join(', ')
        : (err?.error?.message || err?.message || 'Unknown error');
      this.toast.error('Failed to create: ' + errorMsg);
    }
  }

  private readonly READ_KEY = 'vantac_read_tickets';
  readTicketIds = signal<Set<number>>(this.loadReadTicketIds());

  private loadReadTicketIds(): Set<number> {
    try {
      const stored = localStorage.getItem(this.READ_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  }

  private markAsRead(ticketId: number) {
    const ids = this.readTicketIds();
    if (!ids.has(ticketId)) {
      ids.add(ticketId);
      this.readTicketIds.set(new Set(ids));
      localStorage.setItem(this.READ_KEY, JSON.stringify([...ids]));
    }
  }

  isUnread(ticket: any): boolean {
    return !this.readTicketIds().has(ticket.id);
  }

  isSentPending(ticket: any): boolean {
    if (this.mainTab() !== 'request') return false;
    const myId = this.authService.currentUser()?.id;
    return !!myId && ticket.reportedById === myId && ticket.status === 'open';
  }

  isSentStarted(ticket: any): boolean {
    if (this.mainTab() !== 'request') return false;
    const myId = this.authService.currentUser()?.id;
    const startedStatuses = ['in_progress', 'resolved', 'closed'];
    return !!myId && ticket.reportedById === myId && startedStatuses.includes(ticket.status);
  }

  selectedTicket = signal<any>(null);
  ticketComments = signal<any[]>([]);
  newComment = '';

  async viewTicket(ticket: any) {
    this.markAsRead(ticket.id);
    try {
      const response: any = await this.http.get(`${this.apiUrl}/api/v1/tickets/${ticket.id}`).toPromise();
      this.selectedTicket.set(response.ticket);
      this.ticketComments.set(response.ticket.comments || []);
    } catch (err) {
      console.error('Failed to load ticket:', err);
      this.toast.error('Failed to load ticket details');
    }
  }

  closeTicketDetail() {
    this.selectedTicket.set(null);
    this.ticketComments.set([]);
    this.newComment = '';
    this.showForwardPicker = false;
    this.forwardSearch = '';
  }

  async addComment() {
    if (!this.newComment.trim()) return;

    try {
      await this.http.post(`${this.apiUrl}/api/v1/tickets/${this.selectedTicket()!.id}/comments`, {
        comment: this.newComment,
        isInternal: false
      }).toPromise();
      
      this.newComment = '';
      this.toast.success('Comment posted');
      this.viewTicket(this.selectedTicket()!);
    } catch (err) {
      console.error('Failed to add comment:', err);
      this.toast.error('Failed to post comment');
    }
  }

  async updateTicketStatus(status: string) {
    try {
      const ticket = this.selectedTicket()!;
      const isRequest = this.mainTab() === 'request';
      const label = isRequest ? 'Request' : 'Ticket';

      await this.http.put(`${this.apiUrl}/api/v1/tickets/${ticket.id}`,
        this.ticketPayload(ticket, { status })
      ).toPromise();

      if (status === 'in_progress' || status === 'resolved' || status === 'closed') {
        this.toast.unlockByTicketId(ticket.id);
      }

      const statusMessages: Record<string, string> = {
        in_progress: `${label} marked as In Progress`,
        resolved: `${label} resolved`,
        closed: `${label} closed`,
        open: `${label} reopened`,
        cancelled: `${label} cancelled`
      };
      this.toast.champagne(statusMessages[status] || `${label} updated`);

      this.closeTicketDetail();
      this.loadTickets();
      this.loadStats();
    } catch (err) {
      console.error('Failed to update status:', err);
      this.toast.error('Failed to update status');
    }
  }

  async archiveTicket(ticket: any) {
    try {
      await this.http.put(`${this.apiUrl}/api/v1/tickets/${ticket.id}`,
        this.ticketPayload(ticket, { status: 'archived' })
      ).toPromise();
      this.toast.success('Archived successfully');
      this.loadTickets();
      this.loadStats();
    } catch (err) {
      console.error('Failed to archive:', err);
      this.toast.error('Failed to archive');
    }
  }

  async restoreTicket(ticket: any) {
    try {
      await this.http.put(`${this.apiUrl}/api/v1/tickets/${ticket.id}`,
        this.ticketPayload(ticket, { status: 'open' })
      ).toPromise();
      this.toast.champagne('Restored to active');
      this.loadTickets();
      this.loadStats();
    } catch (err) {
      console.error('Failed to restore:', err);
      this.toast.error('Failed to restore');
    }
  }
}
