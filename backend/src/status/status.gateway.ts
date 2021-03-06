import { Server, Socket } from 'socket.io';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
  WsResponse,
} from '@nestjs/websockets';
import User from 'src/api/users/entities/user.entity';
import { Connection } from 'src/status/status.class';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  namespace: 'status',
  cors: {
    // origin: `http://localhost:${process.env.FRONTEND_PORT}`,
    origin: `http://${process.env.HOST}:${process.env.FRONTEND_PORT}`,
    credentials: true,
  },
})
export class StatusGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private server: Server;

  private logger: Logger = new Logger('StatusSystem');
  private connectedClients: Connection[] = [];

  // Init, connection, disconnect event handlers
  afterInit(server: any) {
    this.logger.log('StatusSystem gateway is initialized');
  }

  handleConnection(@ConnectedSocket() client: Socket) {
    // this.logger.log(`Connection: ${client.id}`);
    this.server.to(client.id).emit('requestUserInfo', '');
  }

  handleDisconnect(@ConnectedSocket() client: Socket) {
    // this.logger.log(`Disconnect: ${client.id}`);
    const userIndex = this.connectedClients.findIndex(
      (connection) => connection.socketID.indexOf(client.id) !== -1,
    );

    // Should never append, but prevention is better than cure
    if (userIndex === -1) {
      // console.log('Client: ', client);
      // console.log('Connected Clients: ', this.connectedClients);
      return;
      // throw new WsException('[Status] Disconnecting user was not found');
    }

    // Removing socketID from corresponding user
    this.connectedClients[userIndex].socketID.splice(
      this.connectedClients[userIndex].socketID.indexOf(client.id),
      1,
    );

    // If the user has no more connected sockets, user is offline: removing it and sending updated list
    if (!this.connectedClients[userIndex].socketID.length) {
      this.connectedClients.splice(userIndex, 1);
      // console.log('Clients connected: ', this.connectedClients);
      this.server.emit(
        'update',
        this.connectedClients.map(({ user, ...rest }) => user.id),
      );
    }

    // console.log('Clients connected: ', this.connectedClients);
  }

  @SubscribeMessage('logout')
  handleLogout(@ConnectedSocket() client: Socket) {
    // this.logger.log(`Logout: ${client.id}`);
    const userIndex = this.connectedClients.findIndex(
      (connection) => connection.socketID.indexOf(client.id) !== -1,
    );

    // Should never append, but prevention is better than cure
    if (userIndex === -1) {
      // console.log('Client: ', client);
      // console.log('[Status] Connected Clients: ', this.connectedClients);
      return;
      // throw new WsException('Disconnecting user was not found');
    }

    // console.log(
    //   'User status sockets: ',
    //   this.connectedClients[userIndex].socketID,
    // );

    // Move to login page
    this.server.to(this.connectedClients[userIndex].socketID).emit('logout');
    if ('socketID' in this.connectedClients[userIndex]) {
      // Disconnect all sockets
      this.server
        .to(this.connectedClients[userIndex].socketID)
        .disconnectSockets(true);
    }
    // Delete user and it's sockets from connectedClients
    this.connectedClients.splice(userIndex, 1);
  }

  @SubscribeMessage('connection')
  handleNewConnection(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: User,
  ) {
    // Checking if the user already exists
    const userIndex = this.connectedClients.findIndex(
      (connection) => connection.user.id === data.id,
    );

    // If user was not already connected, add the new user, and send the updated list
    if (userIndex === -1) {
      this.connectedClients.push({ user: data, socketID: [client.id] });
      this.server.emit(
        'update',
        this.connectedClients.map(({ user, ...rest }) => user.id),
      );
      // console.log('Clients connected: ', this.connectedClients);
    }
    // Else, add the new socket to the corresponding Connections object and send client list to new client
    else {
      this.connectedClients[userIndex].socketID.push(client.id);
      this.server.to(client.id).emit(
        'update',
        this.connectedClients.map(({ user, ...rest }) => user.id),
      );
    }

    // console.log('Clients connected: ', this.connectedClients);
  }

  @SubscribeMessage('updateUser')
  updateUser(@ConnectedSocket() client: Socket, @MessageBody() data: User) {
    for (const client of this.connectedClients) {
      const socketIds = client.socketID;
      for (const socketId of socketIds) {
        this.server.to(socketId).emit('updateUser', data);
      }
    }
  }
}

// Differences between this.server.emit() / return { event: , data: }
// 1- this.server.emit() seems to be plateform specific, but send to everyone in the room
// 2- return { event: , data: } seems to only respond to the user that made the request
