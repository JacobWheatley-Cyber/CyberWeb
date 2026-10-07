export interface PayloadTemplate { id: string; name: string; module: string; platform: string; arch: string; formats: string[] }
export interface PayloadInput { template: string; format: string; host: string; port: string | number }
export const PAYLOAD_TEMPLATES: PayloadTemplate[]
export function buildPayloadRequest(input: PayloadInput): { template: PayloadTemplate; host: string; port: number; format: string; args: string[]; handler: string }
