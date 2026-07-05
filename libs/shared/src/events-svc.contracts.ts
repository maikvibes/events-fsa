import { Observable } from 'rxjs';
import { Empty } from './grpc-config';

export const NotificationsPatterns = {
  SEND: 'notifications.send',
  SEND_TO_USER: 'notifications.send-to-user',
  MULTICAST: 'notifications.multicast',
  BROADCAST: 'notifications.broadcast',
  FIND_BY_USER: 'notifications.find-by-user',
  FIND_ALL: 'notifications.find-all',
} as const;

export interface EventDto {
  eventId: string;
  userId: string;
  title: string;
  description: string;
  date: Date;
  createdAt: Date;
  updatedAt: Date;
  // Only populated when the query was made on behalf of an authenticated
  // caller (browse/follow list) — omitted for admin-facing raw reads.
  isFollowing?: boolean;
}

// --- gRPC wire types (events.proto) ---

export const EVENTS_GRPC_PACKAGE = 'events';
export const EVENTS_PROTO_FILE = 'events.proto';

export interface CreateEventRequest {
  userId: string;
  title: string;
  description: string;
  date: string;
}

export interface FindAllRequest {
  callerUserId?: string;
}

export interface FindEventsByUserRequest {
  userId: string;
}

export interface FindEventRequest {
  eventId: string;
}

export interface UpdateEventRequest {
  eventId: string;
  userId: string;
  title?: string;
  description?: string;
  date?: string;
}

export interface DeleteEventRequest {
  eventId: string;
  userId: string;
}

export interface FollowEventRequest {
  eventId: string;
  userId: string;
}

export interface AnnounceEventRequest {
  eventId: string;
  title: string;
  body: string;
}

export interface AnnounceResponseWire {
  notified: number;
}

// date/createdAt/updatedAt travel as ISO strings over the wire; the gateway
// converts them back to real Dates to keep `EventDto` accurate.
export interface EventDtoWire {
  eventId: string;
  userId: string;
  title: string;
  description: string;
  date: string;
  createdAt: string;
  updatedAt: string;
  isFollowing?: boolean;
}

export interface EventListWire {
  events: EventDtoWire[];
}

export interface EventsServiceClient {
  create(data: CreateEventRequest): Observable<EventDtoWire>;
  findAll(data: FindAllRequest): Observable<EventListWire>;
  findFollowedByUser(data: FindEventsByUserRequest): Observable<EventListWire>;
  findOne(data: FindEventRequest): Observable<EventDtoWire>;
  update(data: UpdateEventRequest): Observable<EventDtoWire>;
  delete(data: DeleteEventRequest): Observable<Empty>;
  follow(data: FollowEventRequest): Observable<Empty>;
  unfollow(data: FollowEventRequest): Observable<Empty>;
  announce(data: AnnounceEventRequest): Observable<AnnounceResponseWire>;
}
