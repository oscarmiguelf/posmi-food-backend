import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

export interface DomainEvent {
  event: string;
  data: unknown;
  timestamp: string;
  branchId: string;
}

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/events' })
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private readonly server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  afterInit() {
    this.logger.log('WebSocket gateway initialized');
  }

  handleConnection(client: Socket) {
    const branchId = client.handshake.query['branchId'] as string;
    if (branchId) {
      void client.join(`branch:${branchId}`);
      this.logger.debug(`Client ${client.id} joined branch:${branchId}`);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client ${client.id} disconnected`);
  }

  emitToBranch(branchId: string, event: string, data: unknown) {
    const payload: DomainEvent = {
      event,
      data,
      timestamp: new Date().toISOString(),
      branchId,
    };
    this.server.to(`branch:${branchId}`).emit(event, payload);
  }
}
