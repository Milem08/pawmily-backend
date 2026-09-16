export interface ClinicConfigProps {
  id: string;
  vetId: string;
  clinicName?: string | null;
  clinicAddress?: string | null;
  clinicPhone?: string | null;
  clinicEmail?: string | null;
  clinicHours?: string | null;
  mapUrl?: string | null;
  language: string;
  timezone: string;
  dateFormat: string;
  theme: string;
  notifications: boolean;
  sounds: boolean;
}

export class ClinicConfig {
  constructor(public readonly props: ClinicConfigProps) {}
}
