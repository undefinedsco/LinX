export type TelemetryEventType = 
  | 'message_send'
  | 'message_copy'
  | 'message_delete'
  | 'interaction_action' // approve, reject
  | 'interaction_auto'   // auto-approve
  | 'tool_usage'
  | 'app_view'

export interface TelemetryEvent {
  type: TelemetryEventType
  payload: Record<string, any>
  timestamp?: number
}

export interface TelemetryContextType {
  track: (type: TelemetryEventType, payload?: Record<string, any>) => void
}
