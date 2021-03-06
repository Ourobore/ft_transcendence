import { Logger } from '@nestjs/common';
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
import { Server, Socket } from 'socket.io';
import axios from 'axios';
import User from 'src/api/users/entities/user.entity';
import { Connection } from 'src/status/status.class';
import { GameService } from './game.service';
import { Game, Player, Invites, GameOptions } from 'src/game/game.class';

@WebSocketGateway({
  namespace: 'game',
  cors: {
    // origin: `http://localhost:${process.env.FRONTEND_PORT}`,
    origin: `http://${process.env.HOST}:${process.env.FRONTEND_PORT}`,
    credentials: true,
  },
})
export class GameGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  constructor(private gameService: GameService) {}

  @WebSocketServer()
  private server: Server;

  private logger: Logger = new Logger('GameGateway');
  private connectedClients: Connection[] = [];
  private queue: Connection[] = [];
  private invites: Invites[] = [];

  private matchmakingOptions: GameOptions = { paddleSize: 2, ballSpeed: 3 };

  afterInit(server: any) {
    this.logger.log('Game gateway is initialized');
  }

  handleConnection(@ConnectedSocket() client: Socket) {
    // this.logger.log(`Connection: ${client.id}`);
    this.server.to(client.id).emit('requestGameUserInfo', '');
  }

  @SubscribeMessage('gameConnection')
  handleNewConnection(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: User,
  ) {
    // Checking if the user already exists
    const userIndex = this.connectedClients.findIndex(
      (connection) => connection.user.id === data.id,
    );

    // If user was not already connected, add the new user, and send the updated list
    if (userIndex === -1)
      this.connectedClients.push({ user: data, socketID: [client.id] });
    // Else, add the new socket to the corresponding Connections object and send client list to new client
    else this.connectedClients[userIndex].socketID.push(client.id);

    // console.log('Clients connected: ', this.connectedClients);
  }

  handleDisconnect(@ConnectedSocket() client: Socket) {
    // this.logger.log(`Disconnect: ${client.id}`);
    const userIndex = this.connectedClients.findIndex(
      (connection) => connection.socketID.indexOf(client.id) !== -1,
    );

    // Should never append, but prevention is better than cure
    if (userIndex === -1) {
      // console.log('Client: ', client);
      // console.log('[Game] Connected Clients: ', this.connectedClients);
      return;
      // throw new WsException('Disconnecting user was not found');
    }

    // Removing socketID from corresponding user
    this.connectedClients[userIndex].socketID.splice(
      this.connectedClients[userIndex].socketID.indexOf(client.id),
      1,
    );

    // If the user has no more connected sockets, user is offline: removing it and sending updated list
    if (!this.connectedClients[userIndex].socketID.length)
      this.connectedClients.splice(userIndex, 1);

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
      // console.log('[Game] Connected Clients: ', this.connectedClients);
      return;
      // throw new WsException('Disconnecting user was not found');
    }

    // console.log(
    //   'User game sockets: ',
    //   this.connectedClients[userIndex].socketID,
    // );

    // Move to login page, but not needed here, already in StatusSystem
    // this.server.to(this.connectedClients[userIndex].socketID).emit('logout');
    // Disconnect all sockets
    this.server
      .to(this.connectedClients[userIndex].socketID)
      .disconnectSockets(true);
    // Delete user and it's sockets from connectedClients
    this.connectedClients.splice(userIndex, 1);
  }

  // Queue handling
  @SubscribeMessage('queue')
  async handleQueue(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: User,
  ) {
    // Adding player to queue
    this.queue.push(this.gameService.getUser(this.connectedClients, data));
    this.sendInQueueUsers();
    // console.log('queue: ', this.queue);

    // Start a game if there is at least 2 players in the queue waiting
    while (this.queue.length >= 2) {
      const gameOptions = { paddleSize: 2, ballSpeed: 3 };
      // Remove players from queue
      const playerOne: Player = { player: this.queue.shift() };
      const playerTwo: Player = { player: this.queue.shift() };
      // console.log('playerOne: ', playerOne);
      // console.log('playerTwo: ', playerTwo);

      if (playerOne.player.user.id !== playerTwo.player.user.id) {
        this.sendInQueueUsers();
        this.setupAndStartGame(
          { ...playerOne },
          { ...playerTwo },
          this.matchmakingOptions,
          'matchmaking',
          'startGame'
        );
      }
    }
  }

  setupAndStartGame(
    playerOne: Player,
    playerTwo: Player,
    gameOptions: GameOptions,
    gameMode: string,
    startGameEvent: string,
  ) {
    // Create a socket room, and make ALL player's sockets join
    const roomName = `${playerOne.player.user.id}-${playerTwo.player.user.id}`;
    this.addSocketsToRoom(
      playerOne.player.user,
      playerTwo.player.user,
      roomName,
    );

    // Send startGame event to clients
    this.server.to(roomName).emit(startGameEvent, {
      mode: gameMode,
      players: [playerOne.player.user, playerTwo.player.user],
    });

    // Start the game is the backend
    const isRankedMatch = gameMode === 'matchmaking' ? true : false;
    this.gameService.createGame(playerOne, playerTwo, gameOptions, isRankedMatch);
    // Emit live games to clients
    this.server.emit('liveGames', this.getOngoingGames());
  }

  @SubscribeMessage('leaveQueue')
  leaveQueue(@ConnectedSocket() client: Socket, @MessageBody() data: User) {
    // Removes the user from the queue if they are in it
    const userIndex = this.queue.findIndex(
      (connection) => connection.user.id === data.id,
    );

    if (userIndex !== -1) this.queue.splice(userIndex, 1);
    this.sendInQueueUsers();
  }

  @SubscribeMessage('getOngoingGames')
  handleGetOngoingGames(@ConnectedSocket() client: Socket): WsResponse<any> {
    return { event: 'liveGames', data: this.getOngoingGames() };
  }

  getOngoingGames() {
    const liveGames = this.gameService.getGames().map((value) => {
      return {
        id: value.id,
        playerOne: value.players[0].player.user,
        playerTwo: value.players[1].player.user,
      };
    });
    // console.log('Live Games: ', liveGames);

    return liveGames;
  }

  // Spectators handling
  @SubscribeMessage('addSpectator')
  addSpectator(
    @ConnectedSocket() client: Socket,
    @MessageBody() gameID: number,
  ) {
    // Add a spectator to a game
    const spectatedGame = this.gameService
      .getGames()
      .find((value) => value.id === gameID);

    // console.log('Spectated game: ', spectatedGame);

    // Add the spectator socket to the game room
    if (spectatedGame && !spectatedGame.finished) {
      this.server.to(client.id).socketsJoin(spectatedGame.socketRoom);
      this.server.to(client.id).emit('spectateGame');
    }
    else
      this.server.to(client.id).emit('error', {title: 'Game finished', message: "Can't spectate : game is finishing"})
  }

  // SocketIO room managment
  joinRoom(roomName: string, socketIDs: string[]) {
    if (socketIDs)
      for (const socketID of socketIDs)
        this.server.to(socketID).socketsJoin(roomName);
  }

  @SubscribeMessage('leaveRoom')
  handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() roomName: string,
  ) {
    this.server.to(client.id).socketsLeave(roomName)
  }

  leaveRoom(roomName: string, socketIDs: string[]) {
    for (const socketID of socketIDs)
      this.server.to(socketID).socketsLeave(roomName);
  }

  emitToSockets(event: string, data: any, socketID: string[]) {
    for (const socket of socketID) {
      this.server.to(socket).emit(event, data);
    }
  }

  addSocketsToRoom(playerOne: User, playerTwo: User, socketRoom: string) {
    const playerOneConnection = this.connectedClients.find(
      (client) => client.user.id === playerOne.id,
    );
    const playerTwoConnection = this.connectedClients.find(
      (client) => client.user.id === playerTwo.id,
    );

    let playerOneSockets = [];
    let playerTwoSockets = [];
    if (playerOneConnection) playerOneSockets = playerOneConnection.socketID;
    if (playerTwoConnection) playerTwoSockets = playerTwoConnection.socketID;

    this.joinRoom(socketRoom, [...playerOneSockets, ...playerTwoSockets]);
  }

  sendGameUpdate(game: Game) {
    const gameUpdate = {
      playerOne: {
        user: game.players[0].player.user,
        x: game.players[0].x,
        y: game.players[0].y,
        score: game.players[0].score,
      },
      playerTwo: {
        user: game.players[1].player.user,
        x: game.players[1].x,
        y: game.players[1].y,
        score: game.players[1].score,
      },
      ball: { x: game.ball.x, y: game.ball.y, size: game.ball.size },
      options: game.options,
      roomName: game.socketRoom,
      events: game.events,
    };

    // console.log('gameUpdate: ', gameUpdate);
    this.server.to(game.socketRoom).emit('gameUpdate', gameUpdate);
  }

  async broadcastEndGame(game: Game) {
    try {
      // POST match data in the database through the API
      const body = {
        players: [
          { id: game.players[0].player.user.id },
          { id: game.players[1].player.user.id },
        ],
        score: [game.players[0].score, game.players[1].score],
        isRankedMatch: game.isRankedMatch,
      };
      const match = await axios({
        url: `http://${process.env.FRONTEND_HOST}:${process.env.FRONTEND_PORT}/matches`,
        method: 'POST',
        data: body,
      });
      // console.log('Match Result: ', match.data);
      this.server.emit('askStatsUpdate');

      this.server.to(game.socketRoom).emit('endGame');

      // Make the players / spectators leave the room
      this.server.to(game.socketRoom).socketsLeave(game.socketRoom);
    } catch (error) {
      throw error;
    }
  }

  sendLiveGames() {
    this.server.emit('liveGames', this.getOngoingGames());
  }

  // Player Handling
  @SubscribeMessage('moveLeft')
  handleMoveLeft(@ConnectedSocket() client: Socket, @MessageBody() data: User) {
    try {
      const players = this.gameService.moveLeft(client.id, data);
    } catch (error) {
      throw error;
    }
  }

  @SubscribeMessage('moveRight')
  handleMoveRight(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: User,
  ) {
    try {
      const players = this.gameService.moveRight(client.id, data);
    } catch (error) {
      throw error;
    }
  }

  // Invite handling
  @SubscribeMessage('getInvitesGame')
  getInvites(@ConnectedSocket() client: Socket, @MessageBody() user: User) {
    const indexInvites = this.invites.findIndex(
      (el) => el.user.user.id === user.id,
    );

    let invitesUser: any;
    if (indexInvites === -1) invitesUser = [];
    else invitesUser = this.invites[indexInvites].invitesReceived;

    this.server.to(client.id).emit('updateGameInvites', invitesUser);
  }

  @SubscribeMessage('addInvite')
  addInvite(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    const userWhoInvites = this.connectedClients.find(
      (connection) => connection.user.id === data.playerOne.id,
    );
    const guestUser = this.connectedClients.find(
      (connection) => connection.user.id === data.playerTwo.id,
    );

    if (guestUser) {
      let guestIndex = this.invites.findIndex(
        (connection) => connection.user.user.id === guestUser.user.id,
      );
      // If guest does not already exists in invite array
      if (guestIndex === -1) {
        guestIndex =
          this.invites.push({
            user: guestUser,
            invitesReceived: [
              { sender: userWhoInvites, gameOptions: data.options },
            ],
          }) - 1;
      }
      // If it already exists, push the new invites
      else
        this.invites[guestIndex].invitesReceived.push({
          sender: userWhoInvites,
          gameOptions: data.options,
        });

      // Send updated invites list
      this.emitToSockets(
        'updateGameInvites',
        this.invites[guestIndex].invitesReceived,
        guestUser.socketID,
      );

      // Timer to remove the invite if not accepted
      setTimeout(
        (userInvite, userGuest) => {
          this.removeGameInvite(userInvite, userGuest);
        },
        30000,
        { ...userWhoInvites },
        { ...guestUser },
      );
    }
  }

  @SubscribeMessage('acceptInviteToGame')
  async handleInvite(
    @ConnectedSocket() client: Socket,
    @MessageBody() players: User[],
  ) {
    const userInvite = this.gameService.getUser(
      this.connectedClients,
      players[0],
    );
    const userGuest = this.gameService.getUser(
      this.connectedClients,
      players[1],
    );

    //Remove users from queue
    const userInviteIndex = this.queue.findIndex((user) => user.user.id === userInvite.user.id)
    const userGuestIndex = this.queue.findIndex((user) => user.user.id === userGuest.user.id)
    if (userInviteIndex !== -1) this.queue.splice(userInviteIndex, 1)
    if (userGuestIndex !== -1) this.queue.splice(userGuestIndex, 1)

    // If user are still connected
    if (userInvite && userGuest) {
      // Get game options
      const inviteGuest = this.invites.find(
        (invite) => invite.user.user.id === userGuest.user.id,
      );
      const options = inviteGuest.invitesReceived.find(
        (invite) => invite.sender.user.id === userInvite.user.id,
      ).gameOptions;

      const playerOne: Player = { player: userInvite };
      const playerTwo: Player = { player: userGuest };

      // Launch game
      this.setupAndStartGame(
        { ...playerOne },
        { ...playerTwo },
        options,
        'invite',
        'startGame',
      );

      // Delete guest's invite
      this.removeGameInvite(userInvite, userGuest);
    }
    else {
      this.server.to(client.id).emit('error', { title: 'Game', message: `${players[0].username} is disconnect, the game can't be started` })
    }
  }

  removeGameInvite(userInvite: Connection, userGuest: Connection) {
    // Find guest
    const guestIndex = this.invites.findIndex(
      (guest) => guest.user.user.id === userGuest.user.id,
    );
    if (guestIndex != -1) {
      // Find invite
      const indexInvite = this.invites[guestIndex].invitesReceived.findIndex(
        (invite) => invite.sender.user.id === userInvite.user.id,
      );
      if (indexInvite != -1) {
        // Remove invite
        this.invites[guestIndex].invitesReceived.splice(indexInvite, 1);

        // Send updated invites to the guest user
        this.emitToSockets(
          'updateGameInvites',
          this.invites[guestIndex].invitesReceived,
          userGuest.socketID,
        );

        // If last invite, remove guest from invite array
        if (!this.invites[guestIndex].invitesReceived.length)
          this.invites.splice(guestIndex, 1);
      }
    }
  }

  // Determine if user is in queue
  @SubscribeMessage('inQueueUsers')
  inQueueUsers(@ConnectedSocket() client: Socket) {
    const inQueueUsers: User[] = this.queue.map(
      (connection) => connection.user,
    );

    this.server.to(client.id).emit('inQueueUsers', inQueueUsers);
  }

  sendInQueueUsers() {
    const inQueueUsers: User[] = this.queue.map(
      (connection) => connection.user,
    );

    this.server.emit('inQueueUsers', inQueueUsers);
  }

  // Determine if user is in game
  @SubscribeMessage('inGameUsers')
  isInGame(@ConnectedSocket() client: Socket) {
    const inGameUsers = this.gameService.inGameUsers();

    this.server.to(client.id).emit('inGameUsers', inGameUsers);
  }

  sendInGameUsers() {
    const inGameUsers = this.gameService.inGameUsers();

    this.server.emit('inGameUsers', inGameUsers);
  }
}
