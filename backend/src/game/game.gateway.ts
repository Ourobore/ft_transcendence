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
import { StatusGateway } from 'src/status/status.gateway';
import { Game, Player, Spectator } from 'src/game/game.class';

@WebSocketGateway({
  namespace: 'game',
  cors: {
    origin: `http://localhost:3001`,
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
  public connectedClients: Connection[] = [];
  private queue: Connection[] = [];
  private games: Game[] = [];

  afterInit(server: any) {
    this.logger.log('Game gateway is initialized');
  }

  handleConnection(@ConnectedSocket() client: Socket) {
    this.logger.log(`Connection: ${client.id}`);
  }

  handleDisconnect(@ConnectedSocket() client: Socket) {
    this.logger.log(`Disconnect: ${client.id}`);
  }

  @SubscribeMessage('queue')
  async handleQueue(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: User,
  ) {
    // Adding player to queue
    this.queue.push({
      user: data,
      socketID: this.gameService.getUserSockets(data),
    });
    console.log('queue: ', this.queue);

    // Start a game if there is at least 2 players in the queue waiting
    while (this.queue.length >= 2) {
      // Remove players from queue
      const playerOne: Player = { player: this.queue.shift() };
      const playerTwo: Player = { player: this.queue.shift() };
      console.log('playerOne: ', playerOne);
      console.log('playerTwo: ', playerTwo);

      // Create and start game
      const players = this.gameService.createGame(
        playerOne,
        playerTwo,
        this.server,
      );
      this.server
        .of('/game')
        .to(playerOne.player.socketID[0])
        .to(playerTwo.player.socketID[0])
        .emit('startGame', players);
    }
  }

  @SubscribeMessage('endGame')
  async handleEndGame(
    @ConnectedSocket() clientInformation: Socket,
    @MessageBody() data: any,
  ) {
    // Determining which game
    const gameIndex = this.games.findIndex(
      (game) =>
        game.players[0].player.user.id === data.user.id ||
        game.players[1].player.user.id === data.user.id,
    );

    // Logic will only run on playerOne
    if (
      gameIndex !== -1 &&
      data.user.id === this.games[gameIndex].players[0].player.user.id
    ) {
      // POST match data in the database through the API
      const body = {
        players: [
          { id: this.games[gameIndex].players[0].player.user.id },
          { id: this.games[gameIndex].players[1].player.user.id },
        ],
        score: [data.score[0], data.score[1]],
      };
      const match = await axios({
        url: 'http://localhost:4000/matches',
        method: 'POST',
        data: body,
      });
      // console.log('Match: ', match.data);

      // Remove match from game array
      this.games.splice(gameIndex, 1);
    }
  }

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

  sendGameUpdate(game: Game) {
    const gameUpdate = {
      playerOne: {
        x: game.players[0].x,
        y: game.players[0].y,
        score: game.players[0].score,
      },
      playerTwo: {
        x: game.players[1].x,
        y: game.players[1].y,
        score: game.players[1].score,
      },
      ball: { x: game.ball.x, y: game.ball.y, size: game.ball.size },
      events: game.events,
    };

    // console.log('gameUpdate: ', gameUpdate);
    this.server.emit('gameUpdate', gameUpdate);
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
      };
      const match = await axios({
        url: 'http://localhost:4000/matches',
        method: 'POST',
        data: body,
      });
      // console.log('Match Result: ', match.data);

      this.server.emit('endGame');
    } catch (error) {
      throw error;
    }
  }
}
