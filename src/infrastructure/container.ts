import { RegisterUser } from '../application/identity/RegisterUser';
import { LoginUser } from '../application/identity/LoginUser';
import { GetProfile } from '../application/identity/GetProfile';
import { UpdateProfile } from '../application/identity/UpdateProfile';
import {
  ConfirmEmailVerification,
  ConfirmPasswordReset,
  IssueSession,
  LogoutSession,
  RefreshSession,
  RequestEmailVerification,
  RequestPasswordReset,
} from '../application/identity/AuthSessionUseCases';
import {
  AddMedicalRecord,
  AddReminder,
  CompleteReminder,
  CreatePatient,
  DeleteMedicalRecord,
  DeletePatient,
  DeleteReminder,
  GenerateDiet,
  GetFeeding,
  GetPatient,
  GetPatientBarcode,
  GetPatientByCode,
  LinkPatientByCode,
  ListMedicalRecords,
  ListMyPatients,
  ListPatients,
  ListReminders,
  MigrateAllPatientCodes,
  UnlinkPatient,
  UpdateFeeding,
  UpdateMedicalRecord,
  UpdatePatient,
  UpdateReminder,
} from '../application/patients/PatientUseCases';
import {
  ApproveLinkRequest,
  CreateLinkRequest,
  ListPatientMembers,
  ListPendingLinkRequests,
  LookupPatientForLink,
  RejectLinkRequest,
  RevokePatientMember,
} from '../application/access/LinkRequestUseCases';
import {
  ConfirmMediaUpload,
  CreateMediaUploadUrl,
  GetMediaSignedUrl,
} from '../application/media/MediaUseCases';
import {
  CloseUnloggedFeedingLogs,
  GetFeedingSummary,
  ListFeedingLogs,
  MarkFeedingLog,
  SyncFeedingReminders,
} from '../application/feeding/FeedingLogUseCases';
import { AddFavorite, ListFavorites, RemoveFavorite } from '../application/favorites/FavoriteUseCases';
import {
  AcceptAppointmentRequest,
  ConfirmAppointmentAttendance,
  CreateAppointment,
  DeleteAppointment,
  GetAppointment,
  ListAppointments,
  ListAppointmentsByMonth,
  ListMyAppointments,
  PostponeAppointment,
  RequestAppointment,
  UpdateAppointment,
} from '../application/scheduling/AppointmentUseCases';
import { GetClinicConfig, UpdateClinicConfig } from '../application/clinic/ClinicUseCases';
import { BcryptHasher } from './auth/BcryptHasher';
import { JwtTokenService } from './auth/JwtTokenService';
import { RefreshTokenStore } from './auth/RefreshTokenStore';
import { PrismaUserRepository } from './persistence/prisma/PrismaUserRepository';
import { PrismaPatientRepository } from './persistence/prisma/PrismaPatientRepository';
import { PrismaAppointmentRepository } from './persistence/prisma/PrismaAppointmentRepository';
import { PrismaClinicConfigRepository } from './persistence/prisma/PrismaClinicConfigRepository';
import { PrismaPatientAccessRepository } from './persistence/prisma/PrismaPatientAccessRepository';
import { PrismaLinkRequestRepository } from './persistence/prisma/PrismaLinkRequestRepository';
import { AuditService } from './audit/AuditService';
import { EmailSender } from './email/EmailSender';
import { SupabaseStorage } from './storage/SupabaseStorage';

export function createContainer() {
  const hasher = new BcryptHasher();
  const tokens = new JwtTokenService();
  const refreshStore = new RefreshTokenStore();
  const users = new PrismaUserRepository();
  const patients = new PrismaPatientRepository();
  const appointments = new PrismaAppointmentRepository();
  const clinicConfigs = new PrismaClinicConfigRepository();
  const accesses = new PrismaPatientAccessRepository();
  const linkRequests = new PrismaLinkRequestRepository();
  const audit = new AuditService();
  const email = new EmailSender();
  const storage = new SupabaseStorage();
  const issueSession = new IssueSession(tokens, refreshStore);
  const requestEmailVerification = new RequestEmailVerification(users, email);
  const syncFeedingReminders = new SyncFeedingReminders(patients, accesses);
  const createPatient = new CreatePatient(patients, audit, syncFeedingReminders);
  const updateFeeding = new UpdateFeeding(patients, accesses, syncFeedingReminders);

  return {
    hasher,
    tokens,
    refreshStore,
    users,
    patients,
    appointments,
    clinicConfigs,
    accesses,
    linkRequests,
    audit,
    email,
    storage,
    registerUser: new RegisterUser(users, hasher, issueSession, audit, requestEmailVerification),
    loginUser: new LoginUser(users, hasher, issueSession, audit),
    refreshSession: new RefreshSession(users, tokens, refreshStore, audit),
    logoutSession: new LogoutSession(refreshStore, audit),
    requestPasswordReset: new RequestPasswordReset(users, email, audit),
    confirmPasswordReset: new ConfirmPasswordReset(users, hasher, refreshStore, audit),
    requestEmailVerification,
    confirmEmailVerification: new ConfirmEmailVerification(audit),
    getProfile: new GetProfile(users, storage),
    updateProfile: new UpdateProfile(users, hasher),
    syncFeedingReminders,
    createPatient,
    migrateAllPatientCodes: new MigrateAllPatientCodes(patients, audit),
    listPatients: new ListPatients(patients),
    listMyPatients: new ListMyPatients(patients, accesses),
    getPatient: new GetPatient(patients, accesses),
    getPatientByCode: new GetPatientByCode(patients, accesses),
    getPatientBarcode: new GetPatientBarcode(patients, accesses),
    linkPatientByCode: new LinkPatientByCode(patients, users, accesses),
    unlinkPatient: new UnlinkPatient(patients, accesses, audit),
    lookupPatientForLink: new LookupPatientForLink(patients),
    createLinkRequest: new CreateLinkRequest(patients, accesses, linkRequests, audit),
    listPendingLinkRequests: new ListPendingLinkRequests(linkRequests, accesses),
    approveLinkRequest: new ApproveLinkRequest(patients, accesses, linkRequests, users, audit),
    rejectLinkRequest: new RejectLinkRequest(patients, accesses, linkRequests, audit),
    listPatientMembers: new ListPatientMembers(patients, accesses),
    revokePatientMember: new RevokePatientMember(patients, accesses, audit),
    createMediaUploadUrl: new CreateMediaUploadUrl(patients, accesses, storage, audit),
    confirmMediaUpload: new ConfirmMediaUpload(patients, accesses, users),
    getMediaSignedUrl: new GetMediaSignedUrl(patients, accesses, storage),
    updatePatient: new UpdatePatient(patients, accesses),
    deletePatient: new DeletePatient(patients, audit),
    addMedicalRecord: new AddMedicalRecord(patients, accesses, appointments),
    updateMedicalRecord: new UpdateMedicalRecord(patients, accesses),
    deleteMedicalRecord: new DeleteMedicalRecord(patients, accesses),
    listMedicalRecords: new ListMedicalRecords(patients, accesses),
    generateDiet: new GenerateDiet(patients, accesses),
    updateFeeding,
    getFeeding: new GetFeeding(patients, accesses),
    listFeedingLogs: new ListFeedingLogs(patients, accesses),
    markFeedingLog: new MarkFeedingLog(patients, accesses),
    getFeedingSummary: new GetFeedingSummary(patients, accesses),
    closeUnloggedFeedingLogs: new CloseUnloggedFeedingLogs(),
    listFavorites: new ListFavorites(),
    addFavorite: new AddFavorite(),
    removeFavorite: new RemoveFavorite(),
    addReminder: new AddReminder(patients, accesses),
    updateReminder: new UpdateReminder(patients, accesses),
    completeReminder: new CompleteReminder(patients, accesses),
    listReminders: new ListReminders(patients, accesses),
    deleteReminder: new DeleteReminder(patients, accesses),
    createAppointment: new CreateAppointment(appointments, patients),
    requestAppointment: new RequestAppointment(appointments, patients),
    postponeAppointment: new PostponeAppointment(appointments, patients),
    acceptAppointmentRequest: new AcceptAppointmentRequest(appointments, patients),
    listAppointments: new ListAppointments(appointments),
    listMyAppointments: new ListMyAppointments(appointments, patients),
    confirmAppointmentAttendance: new ConfirmAppointmentAttendance(appointments, patients),
    listAppointmentsByMonth: new ListAppointmentsByMonth(appointments),
    getAppointment: new GetAppointment(appointments),
    updateAppointment: new UpdateAppointment(appointments, patients),
    deleteAppointment: new DeleteAppointment(appointments, patients),
    getClinicConfig: new GetClinicConfig(clinicConfigs),
    updateClinicConfig: new UpdateClinicConfig(clinicConfigs),
  };
}

export type Container = ReturnType<typeof createContainer>;
