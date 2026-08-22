// Registra el cliente WS real como factory por side-effect del import.
import './real-agent';

export * from './client';
export { AGENT_STATUS_LABEL, useAgentStore, type AgentStatus } from './store';
