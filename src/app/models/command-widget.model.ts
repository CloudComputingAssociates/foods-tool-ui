export type RenderIntent = 'bloom' | 'zoom' | 'speak';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface WidgetCommand {
  commandId: number;
  requiresConfirmation: boolean;
  httpMethod: HttpMethod | null;
  apiEndpoint: string | null;
  bodyTemplate: string | null;
  isEnabled: boolean;
}

export interface Widget {
  widgetId: number;
  name: string;
  description: string;
  renderIntent: RenderIntent;
  isEnabled: boolean;
  commands: WidgetCommand[];
}

export interface Command {
  commandId: number;
  name: string;
  description: string;
  verbTokens: string;
  isEnabled: boolean;
}
