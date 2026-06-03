import { Component, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RegiApiService } from '../services/regi-api.service';
import {
  Widget, WidgetCommand, Command,
  RenderIntent, HttpMethod
} from '../models/command-action.model';

@Component({
  selector: 'app-command-action',
  templateUrl: './command-action.component.html',
  styleUrls: ['./command-action.component.scss']
})
export class CommandActionComponent implements OnInit {

  renderIntents: RenderIntent[] = ['bloom', 'zoom', 'speak'];
  httpMethods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

  // ============= WIDGETS =============
  widgets: Widget[] = [];
  private widgetsSnapshot: Widget[] = [];
  selectedWidget: Widget | null = null;
  isLoadingWidgets = false;
  isSavingWidgets = false;

  // ============= COMMANDS =============
  commands: Command[] = [];
  selectedCommand: Command | null = null;
  private originalSelectedCommand: Command | null = null;
  isLoadingCommands = false;
  isSavingCommand = false;

  constructor(
    private apiService: RegiApiService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadWidgets();
    this.loadCommands();
  }

  // ==========================================================================
  // WIDGETS — whole-collection replace
  // ==========================================================================

  loadWidgets(): void {
    this.isLoadingWidgets = true;
    this.apiService.getWidgets().subscribe({
      next: (rows: any) => {
        const list: Widget[] = Array.isArray(rows) ? rows : (rows?.widgets ?? rows?.data ?? []);
        list.forEach(w => { if (!Array.isArray(w.commands)) w.commands = []; });
        this.widgets = list;
        this.widgetsSnapshot = this.deepClone(list);
        this.isLoadingWidgets = false;
        if (this.selectedWidget) {
          const k = this.widgetKey(this.selectedWidget);
          this.selectedWidget = this.widgets.find(w => this.widgetKey(w) === k) ?? null;
        }
      },
      error: (err) => {
        this.widgets = [];
        this.widgetsSnapshot = [];
        this.isLoadingWidgets = false;
        this.snackBar.open(`Failed to load widgets: ${this.errMsg(err)}`, 'Close', { duration: 6000 });
      }
    });
  }

  selectWidget(w: Widget): void {
    this.selectedWidget = w;
  }

  newWidget(): void {
    const stub: Widget = {
      widgetId: 0,
      name: `NewWidget_${Date.now().toString(36)}`,
      description: '',
      renderIntent: 'bloom',
      isEnabled: true,
      commands: []
    };
    this.widgets = [stub, ...this.widgets];
    this.selectedWidget = stub;
  }

  undoSelectedWidget(): void {
    if (!this.selectedWidget) return;
    const idx = this.widgets.indexOf(this.selectedWidget);
    if (idx < 0) return;
    const id = this.selectedWidget.widgetId;
    const snap = id > 0 ? this.widgetsSnapshot.find(s => s.widgetId === id) : null;
    if (snap) {
      this.widgets[idx] = this.deepClone(snap);
      this.selectedWidget = this.widgets[idx];
    } else {
      this.widgets.splice(idx, 1);
      this.selectedWidget = this.widgets[0] ?? null;
    }
  }

  // Mapped Commands — global catalog drives the row list

  isCommandMapped(commandId: number): boolean {
    return !!this.selectedWidget?.commands.some(c => c.commandId === commandId);
  }

  mappingFor(commandId: number): WidgetCommand | null {
    if (!this.selectedWidget) return null;
    return this.selectedWidget.commands.find(c => c.commandId === commandId) ?? null;
  }

  toggleMapping(commandId: number, mapped: boolean): void {
    if (!this.selectedWidget) return;
    if (mapped) {
      if (!this.selectedWidget.commands.some(c => c.commandId === commandId)) {
        this.selectedWidget.commands.push({
          commandId,
          requiresConfirmation: false,
          httpMethod: null,
          apiEndpoint: null,
          bodyTemplate: null,
          isEnabled: true
        });
      }
    } else {
      this.selectedWidget.commands = this.selectedWidget.commands.filter(c => c.commandId !== commandId);
    }
  }

  onMappingMethodChange(mapping: WidgetCommand): void {
    if (!mapping.httpMethod) {
      mapping.apiEndpoint = null;
      mapping.bodyTemplate = null;
    }
  }

  isSurfacing(mapping: WidgetCommand | null): boolean {
    return !mapping || !mapping.httpMethod;
  }

  hasAnyWidgetChanges(): boolean {
    return JSON.stringify(this.widgets) !== JSON.stringify(this.widgetsSnapshot);
  }

  hasSelectedWidgetChanges(): boolean {
    if (!this.selectedWidget) return false;
    const id = this.selectedWidget.widgetId;
    if (!id) return true;
    const snap = this.widgetsSnapshot.find(s => s.widgetId === id);
    if (!snap) return true;
    return JSON.stringify(this.selectedWidget) !== JSON.stringify(snap);
  }

  deleteWidget(): void {
    if (!this.selectedWidget) return;
    if (!confirm(`Delete widget "${this.selectedWidget.name}" and all its command mappings?`)) return;
    const target = this.selectedWidget;
    if (!target.widgetId) {
      this.widgets = this.widgets.filter(w => w !== target);
      this.selectedWidget = this.widgets[0] ?? null;
      return;
    }
    this.apiService.deleteWidget(target.widgetId).subscribe({
      next: () => {
        this.widgets = this.widgets.filter(w => w !== target);
        this.widgetsSnapshot = this.widgetsSnapshot.filter(w => w.widgetId !== target.widgetId);
        this.selectedWidget = this.widgets[0] ?? null;
        this.snackBar.open('Widget deleted', 'Close', { duration: 2500 });
      },
      error: (err) => this.snackBar.open(`Delete widget failed: ${this.errMsg(err)}`, 'Close', { duration: 6000 })
    });
  }

  saveAllWidgets(): void {
    for (const w of this.widgets) {
      if (!w.name?.trim()) {
        this.snackBar.open(`A widget is missing a name`, 'Close', { duration: 5000 });
        return;
      }
      for (const m of w.commands) {
        const hasMethod = !!m.httpMethod;
        const hasEndpoint = !!(m.apiEndpoint && m.apiEndpoint.trim());
        if (hasMethod !== hasEndpoint) {
          this.snackBar.open(
            `Widget "${w.name}": a mapping is half-configured — set both Http Method and Api Endpoint, or leave both blank (surfacing).`,
            'Close', { duration: 6000 });
          return;
        }
        if (m.bodyTemplate && m.bodyTemplate.trim()) {
          try { JSON.parse(m.bodyTemplate); }
          catch {
            this.snackBar.open(`Widget "${w.name}": body template is not valid JSON`, 'Close', { duration: 5000 });
            return;
          }
        }
      }
    }

    this.isSavingWidgets = true;
    const previouslySelectedKey = this.selectedWidget ? this.widgetKey(this.selectedWidget) : null;
    this.apiService.saveAllWidgets(this.widgets).subscribe({
      next: (rows: any) => {
        const list: Widget[] = Array.isArray(rows) ? rows : (rows?.widgets ?? rows?.data ?? []);
        list.forEach(w => { if (!Array.isArray(w.commands)) w.commands = []; });
        this.widgets = list;
        this.widgetsSnapshot = this.deepClone(list);
        if (previouslySelectedKey) {
          this.selectedWidget =
            this.widgets.find(w => this.widgetKey(w) === previouslySelectedKey) ??
            this.widgets[0] ?? null;
        }
        this.isSavingWidgets = false;
        this.snackBar.open('Widgets saved', 'Close', { duration: 2500 });
      },
      error: (err) => {
        this.isSavingWidgets = false;
        this.snackBar.open(`Save widgets failed: ${this.errMsg(err)}`, 'Close', { duration: 6000 });
      }
    });
  }

  private widgetKey(w: Widget): string {
    return w.widgetId > 0 ? `id:${w.widgetId}` : `name:${w.name}`;
  }

  // ==========================================================================
  // COMMANDS — global catalog (whole-collection replace)
  // ==========================================================================

  loadCommands(): void {
    this.isLoadingCommands = true;
    this.apiService.getCommands().subscribe({
      next: (rows: any) => {
        const list: Command[] = Array.isArray(rows) ? rows : (rows?.commands ?? rows?.data ?? []);
        this.commands = list;
        this.isLoadingCommands = false;
      },
      error: (err: HttpErrorResponse) => {
        // GET /commands may not be deployed yet — treat 404 as empty catalog.
        this.commands = [];
        this.isLoadingCommands = false;
        if (err?.status === 404) return;
        this.snackBar.open(`Failed to load commands: ${this.errMsg(err)}`, 'Close', { duration: 6000 });
      }
    });
  }

  selectCommand(c: Command): void {
    this.selectedCommand = c;
    this.originalSelectedCommand = this.deepClone(c);
  }

  newCommand(): void {
    const stub: Command = {
      commandId: 0,
      name: `newCommand_${Date.now().toString(36)}`,
      description: '',
      verbTokens: '[]',
      isEnabled: true
    };
    this.commands = [stub, ...this.commands];
    this.selectCommand(stub);
  }

  hasCommandChanges(): boolean {
    if (!this.selectedCommand || !this.originalSelectedCommand) return false;
    return JSON.stringify(this.selectedCommand) !== JSON.stringify(this.originalSelectedCommand);
  }

  saveCommand(): void {
    if (!this.selectedCommand) return;
    const c = this.selectedCommand;

    if (!c.name?.trim()) {
      this.snackBar.open('Command name is required', 'Close', { duration: 4000 });
      return;
    }
    const vt = (c.verbTokens || '').trim();
    if (!vt) {
      this.snackBar.open('Verb Tokens must be a JSON array (e.g. ["set","change"])', 'Close', { duration: 5000 });
      return;
    }
    try {
      const parsed = JSON.parse(vt);
      if (!Array.isArray(parsed)) throw new Error('not array');
    } catch {
      this.snackBar.open('Verb Tokens must be a JSON array of strings', 'Close', { duration: 5000 });
      return;
    }

    this.isSavingCommand = true;
    const previousKey = c.commandId > 0 ? `id:${c.commandId}` : `name:${c.name}`;
    this.apiService.saveAllCommands(this.commands).subscribe({
      next: (rows: any) => {
        const list: Command[] = Array.isArray(rows) ? rows : (rows?.commands ?? rows?.data ?? []);
        this.commands = list;
        const restored = this.commands.find(x =>
          (x.commandId > 0 ? `id:${x.commandId}` : `name:${x.name}`) === previousKey
        ) ?? this.commands[0] ?? null;
        if (restored) {
          this.selectCommand(restored);
        } else {
          this.selectedCommand = null;
          this.originalSelectedCommand = null;
        }
        this.isSavingCommand = false;
        this.snackBar.open('Command saved', 'Close', { duration: 2500 });
      },
      error: (err) => {
        this.isSavingCommand = false;
        this.snackBar.open(`Save command failed: ${this.errMsg(err)}`, 'Close', { duration: 6000 });
      }
    });
  }

  deleteCommand(): void {
    if (!this.selectedCommand) return;
    if (!confirm(`Delete command "${this.selectedCommand.name}"?`)) return;
    const ref = this.selectedCommand;
    this.commands = this.commands.filter(c => c !== ref);
    if (!ref.commandId) {
      this.selectedCommand = null;
      this.originalSelectedCommand = null;
      return;
    }
    this.isSavingCommand = true;
    this.apiService.saveAllCommands(this.commands).subscribe({
      next: (rows: any) => {
        const list: Command[] = Array.isArray(rows) ? rows : (rows?.commands ?? rows?.data ?? []);
        this.commands = list;
        this.selectedCommand = null;
        this.originalSelectedCommand = null;
        this.isSavingCommand = false;
        this.snackBar.open('Command deleted', 'Close', { duration: 2500 });
      },
      error: (err) => {
        this.isSavingCommand = false;
        this.snackBar.open(`Delete command failed: ${this.errMsg(err)}`, 'Close', { duration: 6000 });
      }
    });
  }

  // ==========================================================================
  // helpers
  // ==========================================================================

  private deepClone<T>(v: T): T {
    return JSON.parse(JSON.stringify(v));
  }

  private errMsg(err: any): string {
    const status = err?.status;
    const body = err?.error;
    const detail = (typeof body === 'string' && body) ||
      body?.message || body?.error || body?.detail || err?.message || 'unknown error';
    return status ? `${status} ${detail}` : detail;
  }

  truncate(s: string | null | undefined, max = 50): string {
    if (!s) return '';
    return s.length > max ? s.substring(0, max) + '...' : s;
  }
}
