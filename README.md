# ft_transcendence

<br/>

An enhanced Pong game. You can now play this famous game with your friends wherever they are, and chat with them in real time!

<br/>

## Tech Stack

### Frontend:

- Vue3
- Pinia
- Bootstrap

### Backend:

- NestJS
- TypeORM
- PostgreSQL
- SocketIO

<br/>

## How to run the app:

First check the ports and hosts in `.env` file. Then:

```
$ make
```

Or to run locally:

### Database

```bash
$ docker-compose up -d postgres
```

### Backend

```bash
$ cd backend
$ npm install
$ npm run dev
```

### Frontend

```bash
$ cd Frontend
$ npm install
$ npm run dev
```

<br/>

All these commands (and more) are also available via Makefile to easily launch dev environments locally.

<br/>

## Team

- josaykos <https://github.com/josayko>
- lchapren <https://github.com/Ourobore>
- mabriand <https://github.com/mabriand-42>
- vmoreau <https://github.com/Dicayne>
- adupuy <https://github.com/AtheDev>
