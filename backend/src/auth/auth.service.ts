import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticationProvider, TokenPayload } from './auth.interface';
import User from 'src/api/users/entities/user.entity';
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';
import { Done } from './auth.interface';
import { UsersService } from 'src/api/users/users.service';
import { CreateUserDTO } from 'src/api/users/dto/create-user.dto';
import { FilterUserDTO } from 'src/api/users/dto/filter-user.dto';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

/**
 * Create a new student user if not found in database
 */
@Injectable()
export class AuthService implements AuthenticationProvider {
  constructor(
    @Inject('USERS_SERVICE')
    private usersService: UsersService,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 42 Api auth validation
   */
  async validateUser(details: CreateUserDTO) {
    const { studentID } = details;
    try {
      const [user] = await this.usersService.getUsersByFilter({
        studID: studentID,
      });
      // console.log(user);

      return user;
    } catch (error) {
      return await this.createUser(details);
    }
  }

  /**
   * Github Api auth validation
   */
  async validateUserGithub(details: CreateUserDTO) {
    const { githubID } = details;
    try {
      const [user] = await this.usersService.getUsersByFilter({
        gitID: githubID,
      });
      // console.log(user);

      return user;
    } catch (error) {
      return await this.createUser(details);
    }
  }

  /**
   * username/password auth validation
   */
  async validateUserLocal(username: string, plainPassword: string) {
    try {
      const filter: FilterUserDTO = { username: username, password: true };
      const [user] = await this.usersService.getUsersByFilter(filter);

      const isPasswordMatching = await bcrypt.compare(
        plainPassword,
        user.password,
      );
      if (!isPasswordMatching) {
        throw new HttpException(
          'Wrong credentials provided',
          HttpStatus.BAD_REQUEST,
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...retUser } = user;
      return retUser;
    } catch (error) {
      throw new HttpException(
        'Wrong credentials provided',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  createUser(details: CreateUserDTO) {
    return this.usersService.createUser(details);
  }

  async findUser(id: number) {
    const [user] = await this.usersService.getUsersByFilter({ id: id });
    return user;
  }

  /*****************************************************************************
   * Jwt
   */
  public getCookieWithJwtToken(userId: number) {
    const payload: TokenPayload = { userId };
    const token = this.jwtService.sign(payload);
    return `Authentication=${token}; HttpOnly; Path=/; Max-Age=${this.configService.get(
      'JWT_EXPIRATION_TIME',
    )}`;
  }

  public getCookieForLogout() {
    return `Authentication=; HttpOnly; Path=/; Max-Age=0`;
  }
}

/*******************************************************************************
 * Handle session store in DB
 */

@Injectable()
export class SessionSerializer extends PassportSerializer {
  constructor(
    @Inject('AUTH_SERVICE')
    private readonly authService: AuthenticationProvider,
  ) {
    super();
  }

  serializeUser(user: User, done: Done) {
    done(null, user);
  }

  async deserializeUser(user: User, done: Done) {
    const userDB = await this.authService.findUser(user.id);
    return userDB ? done(null, userDB) : done(null, null);
  }
}