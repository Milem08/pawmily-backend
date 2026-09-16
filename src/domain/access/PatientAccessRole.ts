export type PatientAccessRole = 'OWNER' | 'CO_OWNER' | 'CAREGIVER';

export const PATIENT_ACCESS_ROLES: PatientAccessRole[] = ['OWNER', 'CO_OWNER', 'CAREGIVER'];

export function isPatientAccessRole(value: string): value is PatientAccessRole {
  return PATIENT_ACCESS_ROLES.includes(value as PatientAccessRole);
}

export type PatientAction =
  | 'READ'
  | 'READ_CLINICAL'
  | 'WRITE_CLINICAL'
  | 'WRITE_FEEDING'
  | 'WRITE_PERSONAL_REMINDER'
  | 'WRITE_MEDICAL_REMINDER'
  | 'MANAGE_ACCESS'
  | 'APPROVE_OWNER_LINK'
  | 'APPROVE_MEMBER_LINK'
  | 'REVOKE_MEMBER'
  | 'UNLINK_SELF'
  | 'UPLOAD_MEDIA'
  | 'UPDATE_PROFILE';

/** Account roles stay vet|owner; pet-level roles live in PatientAccess. */
export function canAccessRolePerform(role: PatientAccessRole | 'VET', action: PatientAction): boolean {
  if (role === 'VET') {
    return (
      action === 'READ' ||
      action === 'READ_CLINICAL' ||
      action === 'WRITE_CLINICAL' ||
      action === 'WRITE_FEEDING' ||
      action === 'WRITE_MEDICAL_REMINDER' ||
      action === 'APPROVE_OWNER_LINK' ||
      action === 'UPLOAD_MEDIA' ||
      action === 'UPDATE_PROFILE' ||
      action === 'UNLINK_SELF'
    );
  }

  const matrix: Record<PatientAccessRole, PatientAction[]> = {
    OWNER: [
      'READ',
      'READ_CLINICAL',
      'WRITE_PERSONAL_REMINDER',
      'MANAGE_ACCESS',
      'APPROVE_MEMBER_LINK',
      'REVOKE_MEMBER',
      'UNLINK_SELF',
      'UPLOAD_MEDIA',
      'UPDATE_PROFILE',
    ],
    CO_OWNER: [
      'READ',
      'READ_CLINICAL',
      'WRITE_PERSONAL_REMINDER',
      'UNLINK_SELF',
      'UPLOAD_MEDIA',
      'UPDATE_PROFILE',
    ],
    CAREGIVER: ['READ', 'READ_CLINICAL', 'UNLINK_SELF'],
  };

  return matrix[role].includes(action);
}
